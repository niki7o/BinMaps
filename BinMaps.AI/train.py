"""
train.py — Fine-tune MobileNetV2 for BinMaps bin classification.

Transfer learning strategy (two phases):
  Phase 1  — backbone frozen, only classifier head trained  (fast, avoids destroying pretrained features)
  Phase 2  — full network unfrozen, fine-tuned at a lower LR  (adapts features to our domain)

CSV format:  data/labels.csv
    filename,fill_percent,label        ← fill_percent column is ignored at training time
    img_001.jpg,91,full
    img_002.jpg,85,fire

Labels must be one of: clean | moderate | full | fire | damaged
Images must be placed in:  data/images/

Usage:
    python train.py
    python train.py --phase1 15 --phase2 30 --batch 8

Output:
    bin_fill_model.pth  — best weights (saved whenever val accuracy improves)
"""

import argparse
import csv
import os
import sys

import torch
import torch.nn as nn
import torchvision.models as tv_models
from PIL import Image
from torch.utils.data import DataLoader, Dataset, random_split
from torchvision import transforms

# ---------------------------------------------------------------------------
# Constants — MUST stay in sync with app.py
# ---------------------------------------------------------------------------
CLASSES      = ["clean", "moderate", "full", "fire", "damaged"]
CLASS_TO_IDX = {c: i for i, c in enumerate(CLASSES)}


# ---------------------------------------------------------------------------
# Model factory — identical to _build_model() in app.py
# ---------------------------------------------------------------------------

def build_model(num_classes: int = 5, pretrained: bool = True) -> nn.Module:
    """
    MobileNetV2 backbone + custom linear head.

    pretrained=True  → loads ImageNet weights (use for training)
    pretrained=False → random weights          (use in app.py at inference,
                        which then loads our own bin_fill_model.pth)
    """
    weights = tv_models.MobileNet_V2_Weights.IMAGENET1K_V1 if pretrained else None
    model   = tv_models.mobilenet_v2(weights=weights)
    in_feat = model.classifier[1].in_features   # 1280 for MobileNetV2
    model.classifier[1] = nn.Linear(in_feat, num_classes)
    return model


# ---------------------------------------------------------------------------
# Dataset
# ---------------------------------------------------------------------------
TRAIN_TRANSFORM = transforms.Compose([
    transforms.Resize((256, 256)),
    transforms.RandomCrop(224),
    transforms.RandomHorizontalFlip(),
    transforms.RandomVerticalFlip(p=0.2),
    transforms.ColorJitter(brightness=0.4, contrast=0.4, saturation=0.3, hue=0.05),
    transforms.RandomRotation(15),
    transforms.ToTensor(),
    transforms.Normalize(mean=[0.485, 0.456, 0.406],
                         std=[0.229, 0.224, 0.225]),
])

VAL_TRANSFORM = transforms.Compose([
    transforms.Resize((224, 224)),
    transforms.ToTensor(),
    transforms.Normalize(mean=[0.485, 0.456, 0.406],
                         std=[0.229, 0.224, 0.225]),
])


class BinDataset(Dataset):
    """
    Reads labels.csv (columns: filename, [fill_percent,] label).
    The fill_percent column is accepted but ignored — only label is used.
    """

    def __init__(self, csv_file: str, image_dir: str, transform=None):
        self.image_dir = image_dir
        self.transform = transform
        self.data: list[tuple[str, int]] = []

        with open(csv_file, newline="", encoding="utf-8") as f:
            reader = csv.DictReader(f)
            for row in reader:
                label_str = row.get("label", "").strip().lower()
                if label_str not in CLASS_TO_IDX:
                    print(f"  WARNING: unknown label '{label_str}' — skipping row {row}")
                    continue
                self.data.append((row["filename"].strip(), CLASS_TO_IDX[label_str]))

        if not self.data:
            raise ValueError(
                f"No valid rows in {csv_file}.\n"
                "CSV must have columns 'filename' and 'label'.\n"
                f"Labels: {', '.join(CLASSES)}"
            )

    def __len__(self) -> int:
        return len(self.data)

    def __getitem__(self, idx: int):
        filename, label_idx = self.data[idx]
        img_path = os.path.join(self.image_dir, filename)
        image = Image.open(img_path).convert("RGB")
        if self.transform:
            image = self.transform(image)
        return image, torch.tensor(label_idx, dtype=torch.long)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _freeze_backbone(model: nn.Module) -> None:
    """Freeze everything except the classifier head."""
    for param in model.parameters():
        param.requires_grad = False
    for param in model.classifier.parameters():
        param.requires_grad = True


def _unfreeze_all(model: nn.Module) -> None:
    for param in model.parameters():
        param.requires_grad = True


class TransformWrapper(Dataset):
    """Applies a transform to a random_split Subset without touching the base dataset."""
    def __init__(self, subset, transform):
        self.subset    = subset
        self.transform = transform

    def __len__(self):
        return len(self.subset)

    def __getitem__(self, idx):
        filename, label_idx = self.subset.dataset.data[self.subset.indices[idx]]
        img_path = os.path.join(self.subset.dataset.image_dir, filename)
        image = Image.open(img_path).convert("RGB")
        image = self.transform(image)
        return image, torch.tensor(label_idx, dtype=torch.long)


def _run_epoch(model, loader, criterion, optimizer, device, training: bool):
    model.train(training)
    total_loss, correct, total = 0.0, 0, 0

    ctx = torch.enable_grad() if training else torch.no_grad()
    with ctx:
        for images, labels in loader:
            images, labels = images.to(device), labels.to(device)
            if training:
                optimizer.zero_grad()
            logits = model(images)
            loss   = criterion(logits, labels)
            if training:
                loss.backward()
                optimizer.step()
            total_loss += loss.item()
            correct    += (logits.argmax(dim=1) == labels).sum().item()
            total      += labels.size(0)

    return total_loss / max(len(loader), 1), 100.0 * correct / max(total, 1)


# ---------------------------------------------------------------------------
# Main training function
# ---------------------------------------------------------------------------

def train(
    csv_file:    str   = "data/labels.csv",
    image_dir:   str   = "data/images",
    output_path: str   = "bin_fill_model.pth",
    phase1_epochs: int = 10,    # frozen backbone — train head only
    phase2_epochs: int = 25,    # unfrozen — full fine-tune at lower LR
    batch_size:  int   = 8,
    lr_head:     float = 1e-3,  # phase 1 LR
    lr_finetune: float = 1e-4,  # phase 2 LR
    val_split:   float = 0.2,
    seed:        int   = 42,
):
    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    print(f"Device: {device}")

    # ── Dataset ──────────────────────────────────────────────────────────────
    full_dataset = BinDataset(csv_file, image_dir, transform=None)
    n_total = len(full_dataset)
    n_val   = max(1, int(n_total * val_split))
    n_train = n_total - n_val

    print(f"Dataset: {n_total} samples  →  train={n_train}, val={n_val}")

    torch.manual_seed(seed)
    train_subset, val_subset = random_split(full_dataset, [n_train, n_val])

    train_loader = DataLoader(
        TransformWrapper(train_subset, TRAIN_TRANSFORM),
        batch_size=batch_size, shuffle=True, num_workers=0,
    )
    val_loader = DataLoader(
        TransformWrapper(val_subset, VAL_TRANSFORM),
        batch_size=batch_size, shuffle=False, num_workers=0,
    )

    # ── Class distribution ────────────────────────────────────────────────────
    all_labels = [label for _, label in full_dataset.data]
    print("Class distribution:")
    for i, cls in enumerate(CLASSES):
        count = all_labels.count(i)
        print(f"  [{i}] {cls:10s}  {count:4d} samples")

    # ── Model (MobileNetV2 with ImageNet weights) ─────────────────────────────
    model     = build_model(num_classes=len(CLASSES), pretrained=True).to(device)
    criterion = nn.CrossEntropyLoss()

    best_val_acc = 0.0
    best_epoch   = 0
    total_epochs = phase1_epochs + phase2_epochs

    # ══════════════════════════════════════════════════════════════════════════
    # Phase 1 — freeze backbone, train classifier head only
    # ══════════════════════════════════════════════════════════════════════════
    if phase1_epochs > 0:
        print(f"\n{'─'*60}")
        print(f"Phase 1 — frozen backbone ({phase1_epochs} epochs, LR={lr_head})")
        print(f"{'─'*60}")

        _freeze_backbone(model)
        optimizer = torch.optim.Adam(
            filter(lambda p: p.requires_grad, model.parameters()),
            lr=lr_head, weight_decay=1e-4,
        )
        scheduler = torch.optim.lr_scheduler.CosineAnnealingLR(
            optimizer, T_max=phase1_epochs
        )

        for epoch in range(1, phase1_epochs + 1):
            tr_loss, tr_acc = _run_epoch(model, train_loader, criterion, optimizer, device, training=True)
            va_loss, va_acc = _run_epoch(model, val_loader,   criterion, optimizer, device, training=False)
            scheduler.step()

            marker = ""
            if va_acc > best_val_acc:
                best_val_acc = va_acc
                best_epoch   = epoch
                torch.save(model.state_dict(), output_path)
                marker = "  ← saved"

            print(
                f"  P1 Epoch {epoch:3d}/{phase1_epochs}  "
                f"train loss={tr_loss:.4f} acc={tr_acc:.1f}%  "
                f"val loss={va_loss:.4f} acc={va_acc:.1f}%{marker}"
            )

    # ══════════════════════════════════════════════════════════════════════════
    # Phase 2 — unfreeze all layers, fine-tune at lower LR
    # ══════════════════════════════════════════════════════════════════════════
    if phase2_epochs > 0:
        print(f"\n{'─'*60}")
        print(f"Phase 2 — full fine-tuning ({phase2_epochs} epochs, LR={lr_finetune})")
        print(f"{'─'*60}")

        _unfreeze_all(model)
        optimizer = torch.optim.Adam(model.parameters(), lr=lr_finetune, weight_decay=1e-4)
        scheduler = torch.optim.lr_scheduler.CosineAnnealingLR(
            optimizer, T_max=phase2_epochs
        )

        for epoch in range(1, phase2_epochs + 1):
            tr_loss, tr_acc = _run_epoch(model, train_loader, criterion, optimizer, device, training=True)
            va_loss, va_acc = _run_epoch(model, val_loader,   criterion, optimizer, device, training=False)
            scheduler.step()

            marker = ""
            if va_acc > best_val_acc:
                best_val_acc = va_acc
                best_epoch   = phase1_epochs + epoch
                torch.save(model.state_dict(), output_path)
                marker = "  ← saved"

            print(
                f"  P2 Epoch {epoch:3d}/{phase2_epochs}  "
                f"train loss={tr_loss:.4f} acc={tr_acc:.1f}%  "
                f"val loss={va_loss:.4f} acc={va_acc:.1f}%{marker}"
            )

    # ── Summary ───────────────────────────────────────────────────────────────
    print(f"\nBest val accuracy: {best_val_acc:.1f}%  (epoch {best_epoch}/{total_epochs})")
    print(f"Model saved to: {output_path}")

    # ── Per-class report on validation set ───────────────────────────────────
    print("\nPer-class accuracy on validation set:")
    state = torch.load(output_path, map_location=device, weights_only=True)
    model.load_state_dict(state)
    model.eval()

    class_correct = [0] * len(CLASSES)
    class_total   = [0] * len(CLASSES)

    with torch.no_grad():
        for images, labels in val_loader:
            images, labels = images.to(device), labels.to(device)
            preds = model(images).argmax(dim=1)
            for pred, true in zip(preds, labels):
                class_total[true.item()] += 1
                if pred == true:
                    class_correct[true.item()] += 1

    for i, cls in enumerate(CLASSES):
        n = class_total[i]
        if n:
            print(f"  {cls:10s}: {class_correct[i]}/{n}  ({100*class_correct[i]//n}%)")
        else:
            print(f"  {cls:10s}: no samples in validation set")


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------

def _parse_args():
    p = argparse.ArgumentParser(description="Train BinMaps AI (MobileNetV2 transfer learning)")
    p.add_argument("--csv",     default="data/labels.csv",   help="Path to labels CSV")
    p.add_argument("--images",  default="data/images",        help="Directory with training images")
    p.add_argument("--output",  default="bin_fill_model.pth", help="Output .pth file")
    p.add_argument("--phase1",  type=int,   default=10,       help="Frozen backbone epochs")
    p.add_argument("--phase2",  type=int,   default=25,       help="Full fine-tuning epochs")
    p.add_argument("--batch",   type=int,   default=8,        help="Batch size")
    p.add_argument("--lr-head", type=float, default=1e-3,     help="LR for phase 1 (head only)")
    p.add_argument("--lr-fine", type=float, default=1e-4,     help="LR for phase 2 (full model)")
    return p.parse_args()


if __name__ == "__main__":
    args = _parse_args()

    if not os.path.exists(args.csv):
        print(f"ERROR: CSV not found: {args.csv}")
        print(f"Labels must be one of: {', '.join(CLASSES)}")
        sys.exit(1)

    if not os.path.isdir(args.images):
        print(f"ERROR: Image directory not found: {args.images}")
        sys.exit(1)

    train(
        csv_file      = args.csv,
        image_dir     = args.images,
        output_path   = args.output,
        phase1_epochs = args.phase1,
        phase2_epochs = args.phase2,
        batch_size    = args.batch,
        lr_head       = getattr(args, "lr_head"),
        lr_finetune   = getattr(args, "lr_fine"),
    )

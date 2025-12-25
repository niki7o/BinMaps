import csv
import os
from PIL import Image

import torch
import torch.nn as nn
from torch.utils.data import Dataset, DataLoader
from torchvision import transforms

from model import BinFillCNN



class BinDataset(Dataset):
    def __init__(self, csv_file, image_dir):
        self.image_dir = image_dir
        self.data = []

        with open(csv_file, newline="") as f:
            reader = csv.DictReader(f)
            for row in reader:
                self.data.append(row)

        self.transform = transforms.Compose([
            transforms.Resize((224, 224)),
            transforms.ColorJitter(
                brightness=0.4,
                contrast=0.4
            ),
            transforms.RandomRotation(10),
            transforms.ToTensor()
        ])

    def __len__(self):
        return len(self.data)

    def __getitem__(self, idx):
        row = self.data[idx]
        img_path = os.path.join(self.image_dir, row["filename"])

        image = Image.open(img_path).convert("RGB")
        image = self.transform(image)

        fill_percent = float(row["fill_percent"]) / 100.0
        fill_percent = torch.tensor([fill_percent], dtype=torch.float32)

        return image, fill_percent



def main():
    dataset = BinDataset(
        csv_file="data/labels.csv",
        image_dir="data/images"
    )

    loader = DataLoader(
        dataset,
        batch_size=8,
        shuffle=True
    )

    model = BinFillCNN()
    criterion = nn.MSELoss()
    optimizer = torch.optim.Adam(model.parameters(), lr=0.001)


    epochs = 20

    for epoch in range(epochs):
        total_loss = 0

        for images, targets in loader:
            predictions = model(images)
            loss = criterion(predictions, targets)

            optimizer.zero_grad()
            loss.backward()
            optimizer.step()

            total_loss += loss.item()

        avg_loss = total_loss / len(loader)
        print(f"Epoch {epoch+1}/{epochs} - Loss: {avg_loss:.4f}")
    torch.save(model.state_dict(), "bin_fill_model.pth")
    print("Model saved as bin_fill_model.pth")



if __name__ == "__main__":
    main()

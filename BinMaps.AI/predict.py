import sys
from PIL import Image
import torch
from torchvision import transforms
import numpy as np
from model import BinFillCNN


def load_model():
    model = BinFillCNN()
    model.load_state_dict(torch.load("bin_fill_model.pth", map_location="cpu"))
    model.eval()
    return model


def predict(image_path, runs=10):
    transform = transforms.Compose([
        transforms.Resize((224, 224)),
        transforms.ToTensor()
    ])

    image = Image.open(image_path).convert("RGB")
    image = transform(image).unsqueeze(0)

    model = load_model()
    model.train()

    results = []

    with torch.no_grad():
        for _ in range(runs):
            output = model(image)
            results.append(output.item() * 100)

    mean = np.mean(results)
    std = np.std(results)

    confidence = max(0, 100 - std * 2)

    return round(mean, 2), round(confidence, 2)


if __name__ == "__main__":
    image_path = sys.argv[1]
    fill, confidence = predict(image_path)
    print(f"Fill: {fill}% | Confidence: {confidence}%")

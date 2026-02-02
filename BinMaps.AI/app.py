# app.py
from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from PIL import Image
import io
import torch
from torchvision import transforms
import numpy as np
from model import BinFillCNN

app = FastAPI(title="BinMaps Fill Level API")


device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
model = BinFillCNN().to(device)
model.load_state_dict(torch.load("bin_fill_model.pth", map_location=device))
model.eval()

transform = transforms.Compose([
    transforms.Resize((224, 224)),
    transforms.ToTensor(),
    transforms.Normalize(mean=[0.485, 0.456, 0.406], std=[0.229, 0.224, 0.225])  # ImageNet статистики

])

@app.post("/analyze")
async def analyze_image(photo: UploadFile = File(...)):

    if not photo.content_type.startswith('image/'):
        raise HTTPException(status_code=400, detail="Файлът трябва да е изображение")

    try:
        contents = await photo.read()
        image = Image.open(io.BytesIO(contents)).convert("RGB")
        image_tensor = transform(image).unsqueeze(0).to(device)


        runs = 10
        results = []
        with torch.no_grad():
            for _ in range(runs):
                output = model(image_tensor)
                results.append(output.item() * 100)

        mean_fill = np.mean(results)
        std_fill = np.std(results)
        confidence = max(0, 100 - std_fill * 2)

        return {
            "fill_percentage": round(mean_fill, 2),
            "confidence": round(confidence, 2),
            "fire_detected": bool(mean_fill > 95 and confidence > 85)
        }

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Грешка при обработка: {str(e)}")



app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:4200", "https://localhost:7277", "*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
def health_check():
    return {"status": "healthy"}
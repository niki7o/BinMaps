using System.Text.Json.Serialization;

namespace BinMaps.Shared.DTOs;

public sealed class AIResultDto
{
    [JsonPropertyName("fill_percentage")]
    public double FillPercentage { get; set; }

    [JsonPropertyName("fire_detected")]
    public bool FireDetected { get; set; }

    [JsonPropertyName("confidence")]
    public double Confidence { get; set; }

    [JsonPropertyName("detected_class")]
    public string DetectedClass { get; set; } = string.Empty;


    [JsonPropertyName("container_detected")]
    public bool ContainerDetected { get; set; } = true;
}
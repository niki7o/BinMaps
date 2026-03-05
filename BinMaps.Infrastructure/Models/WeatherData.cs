

namespace BinMaps.Infrastructure.Models
{
    public sealed class WeatherSnapshot
{
    public double TemperatureCelsius { get; init; }
    public int HumidityPercent { get; init; }
    public double PressureHpa { get; init; }
    public string Condition { get; init; } = "Clear";
    public double WindSpeedMs { get; init; }
    public DateTime RecordedAt { get; init; }
}

public sealed class TrafficSnapshot
{
    public int CongestionLevel { get; init; }
    public double CurrentSpeedKmh { get; init; }
    public double FreeFlowSpeedKmh { get; init; }
    public DateTime RecordedAt { get; init; }
}
}
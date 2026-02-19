

namespace BinMaps.Infrastructure.Models
{
    public class WeatherData
    {
        public double Temperature { get; set; }
        public int Humidity { get; set; }
        public double Pressure { get; set; }
        public string WeatherCondition { get; set; } = "Clear";
        public double WindSpeed { get; set; }
        public DateTime Timestamp { get; set; }
    }

    public class TrafficData
    {
        public int CongestionLevel { get; set; }
        public double CurrentSpeed { get; set; }
        public double FreeFlowSpeed { get; set; }
        public DateTime Timestamp { get; set; }
    }

  
    public class OpenWeatherResponse
    {
        public MainWeatherData Main { get; set; } = new();
        public List<WeatherDescription> Weather { get; set; } = new();
        public WindData Wind { get; set; } = new();
    }

    public class MainWeatherData
    {
        public double Temp { get; set; }
        public int Humidity { get; set; }
        public double Pressure { get; set; }
    }

    public class WeatherDescription
    {
        public string Main { get; set; } = string.Empty;
        public string Description { get; set; } = string.Empty;
    }

    public class WindData
    {
        public double Speed { get; set; }
    }

    public class TomTomResponse
    {
        public FlowSegmentData FlowSegmentData { get; set; } = new();
    }

    public class FlowSegmentData
    {
        public double CurrentSpeed { get; set; }
        public double FreeFlowSpeed { get; set; }
    }
}
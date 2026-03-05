namespace BinMaps.Infrastructure.Services.Interfaces;

public interface IExternalWeatherService
{
    Task<double?> GetAmbientTemperatureAsync(double lat, double lng);
}
using System.Net;
using System.Text.Json;

namespace BinMaps.API.Middleware;

public sealed class GlobalExceptionMiddleware
{
    private readonly RequestDelegate _next;
    private readonly ILogger<GlobalExceptionMiddleware> _logger;

    public GlobalExceptionMiddleware(RequestDelegate next, ILogger<GlobalExceptionMiddleware> logger)
    {
        _next = next;
        _logger = logger;
    }

    public async Task InvokeAsync(HttpContext context)
    {
        try
        {
            await _next(context);
        }
        catch (InvalidOperationException ex)
        {
            _logger.LogWarning(ex, "Business rule violation.");
            await WriteErrorAsync(context, HttpStatusCode.BadRequest, ex.Message);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Unhandled exception.");
            await WriteErrorAsync(context, HttpStatusCode.InternalServerError, "Вътрешна грешка на сървъра.");
        }
    }

    private static Task WriteErrorAsync(HttpContext ctx, HttpStatusCode code, string message)
    {
        ctx.Response.ContentType = "application/json";
        ctx.Response.StatusCode = (int)code;

        return ctx.Response.WriteAsync(JsonSerializer.Serialize(new { message }));
    }
}
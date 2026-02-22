using Microsoft.AspNetCore.SignalR;

namespace BinMaps.API.Hubs;

public sealed class ContainerHub : Hub
{
    public override async Task OnConnectedAsync()
    {
        await Clients.Caller.SendAsync("Connected", Context.ConnectionId);
        await base.OnConnectedAsync();
    }

    public override Task OnDisconnectedAsync(Exception? exception)
        => base.OnDisconnectedAsync(exception);
}
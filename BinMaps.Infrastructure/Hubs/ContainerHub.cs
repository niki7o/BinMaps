using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.SignalR;
using System.Threading.Tasks;

namespace BinMaps.Infrastructure.Hubs
{
    // SignalR hub is authenticated: JWT must be passed either via
    // `Authorization: Bearer <token>` or the `access_token` query string
    // (the latter is required by the browser WebSocket API).
    //
    // Anonymous subscribers to real-time container/truck updates were a
    // data-leak: positions of waste trucks and bin fill levels are operational
    // data and should not be broadcast to the public internet.
    [Authorize]
    public class ContainerHub : Hub
    {
        public override async Task OnConnectedAsync()
        {
            await base.OnConnectedAsync();
        }

        public override async Task OnDisconnectedAsync(Exception? exception)
        {
            await base.OnDisconnectedAsync(exception);
        }
    }
}

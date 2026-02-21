using Microsoft.AspNetCore.SignalR;
using System.Threading.Tasks;

namespace BinMaps.Infrastructure.Hubs
{

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
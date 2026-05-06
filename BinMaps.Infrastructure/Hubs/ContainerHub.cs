using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.SignalR;
using System;
using System.Security.Claims;
using System.Threading.Tasks;

namespace BinMaps.Infrastructure.Hubs
{
    [Authorize]
    public class ContainerHub : Hub
    {
        private const string AdminsGroup  = "admins";
        private const string DriversGroup = "drivers";
        private const string UsersGroup   = "users";

        private readonly LiveDriverTracker _tracker;

        public ContainerHub(LiveDriverTracker tracker)
        {
            _tracker = tracker;
        }

        public override async Task OnConnectedAsync()
        {
            var group = GetRoleGroup();
            await Groups.AddToGroupAsync(Context.ConnectionId, group);
            await base.OnConnectedAsync();
        }

        public override async Task OnDisconnectedAsync(Exception? exception)
        {
            var group = GetRoleGroup();
            await Groups.RemoveFromGroupAsync(Context.ConnectionId, group);
            await base.OnDisconnectedAsync(exception);
        }

        [Authorize(Roles = "Driver,Admin")]
        public async Task DriverPosition(DriverPositionPayload payload)
        {
            if (payload is null) return;

            var userId   = Context.UserIdentifier ?? string.Empty;
            var userName = Context.User?.Identity?.Name ?? string.Empty;
            var now      = DateTime.UtcNow;

            if (string.Equals(payload.Phase, "end", StringComparison.OrdinalIgnoreCase))
            {
                _tracker.Remove(userId);
            }
            else
            {
                _tracker.Upsert(new LiveDriverEntry
                {
                    DriverId   = userId,
                    DriverName = userName,
                    RunId      = payload.RunId,
                    AreaId     = payload.AreaId,
                    Lat        = payload.Lat,
                    Lng        = payload.Lng,
                    Heading    = payload.Heading,
                    SpeedKmh   = payload.SpeedKmh,
                    StopIndex  = payload.StopIndex,
                    TotalStops = payload.TotalStops,
                    Load       = payload.Load,
                    Phase      = payload.Phase ?? "move",
                    At         = now,
                });
            }

            var evt = new
            {
                driverId   = userId,
                driverName = userName,
                runId      = payload.RunId,
                areaId     = payload.AreaId,
                lat        = payload.Lat,
                lng        = payload.Lng,
                heading    = payload.Heading,
                speedKmh   = payload.SpeedKmh,
                stopIndex  = payload.StopIndex,
                totalStops = payload.TotalStops,
                load       = payload.Load,
                phase      = payload.Phase,  
                at         = now,
            };

            await Task.WhenAll(
                Clients.Group(AdminsGroup ).SendAsync("DriverPosition", evt),
                Clients.Group(DriversGroup).SendAsync("DriverPosition", evt),
                Clients.Group(UsersGroup  ).SendAsync("DriverPosition", evt));
        }

        private string GetRoleGroup()
        {
            if (Context.User?.IsInRole("Admin")  == true) return AdminsGroup;
            if (Context.User?.IsInRole("Driver") == true) return DriversGroup;
            return UsersGroup;
        }
    }

    public sealed class DriverPositionPayload
    {
        public int    RunId      { get; set; }     
        public string AreaId     { get; set; } = "";
        public double Lat        { get; set; }
        public double Lng        { get; set; }
        public double Heading    { get; set; }     
        public double SpeedKmh   { get; set; }
        public int    StopIndex  { get; set; }
        public int    TotalStops { get; set; }
        public double Load       { get; set; }    
        public string Phase      { get; set; } = "move";
    }
}

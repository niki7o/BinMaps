using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.SignalR;
using System;
using System.Security.Claims;
using System.Threading.Tasks;

namespace BinMaps.Infrastructure.Hubs
{
    /// <summary>
    /// Real-time hub for container updates and driver telemetry.
    ///
    /// Security: JWT is required and may be passed via the
    /// <c>Authorization: Bearer</c> header, or — because browser
    /// WebSockets cannot set headers — via the <c>access_token</c>
    /// query string (wired up in <c>Program.cs</c>).
    ///
    /// Groups used:
    ///   admins   — only users in role <c>Admin</c>; receive driver telemetry
    ///   drivers  — only users in role <c>Driver</c>; receive route dispatch
    ///   users    — everyone else; receive public container/report events
    /// </summary>
    [Authorize]
    public class ContainerHub : Hub
    {
        private const string AdminsGroup  = "admins";
        private const string DriversGroup = "drivers";
        private const string UsersGroup   = "users";

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

        /// <summary>
        /// Driver pushes their current position while a route is active.
        /// Broadcast is one-way to admins only (never back to other drivers
        /// or the public group).
        /// </summary>
        [Authorize(Roles = "Driver,Admin")]
        public Task DriverPosition(DriverPositionPayload payload)
        {
            if (payload is null) return Task.CompletedTask;

            var userId   = Context.UserIdentifier ?? string.Empty;
            var userName = Context.User?.Identity?.Name ?? string.Empty;

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
                phase      = payload.Phase,  // "start" | "move" | "stop" | "end"
                at         = DateTime.UtcNow,
            };

            return Clients.Group(AdminsGroup).SendAsync("DriverPosition", evt);
        }

        private string GetRoleGroup()
        {
            if (Context.User?.IsInRole("Admin")  == true) return AdminsGroup;
            if (Context.User?.IsInRole("Driver") == true) return DriversGroup;
            return UsersGroup;
        }
    }

    /// <summary>Payload sent by the driver client during active navigation.</summary>
    public sealed class DriverPositionPayload
    {
        public int    RunId      { get; set; }     // 0 until persistence lands
        public string AreaId     { get; set; } = "";
        public double Lat        { get; set; }
        public double Lng        { get; set; }
        public double Heading    { get; set; }     // degrees (0 = north)
        public double SpeedKmh   { get; set; }
        public int    StopIndex  { get; set; }
        public int    TotalStops { get; set; }
        public double Load       { get; set; }     // litres collected so far
        public string Phase      { get; set; } = "move";
    }
}

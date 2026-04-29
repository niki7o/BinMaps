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

        /// <summary>
        /// Driver pushes their current position while a route is active.
        ///
        /// Broadcast targets (changed): every authenticated client now sees
        /// driver positions — admins to monitor the fleet, drivers to see
        /// peers (and avoid double-starting a route), citizens to watch the
        /// service in motion. Privacy is fine: payload is just truck
        /// telemetry, no PII beyond a display name.
        ///
        /// Last-known position is also stashed in <see cref="LiveDriverTracker"/>
        /// so a client that connects mid-route can catch up via the snapshot
        /// endpoint instead of waiting up to a full update cycle.
        /// </summary>
        [Authorize(Roles = "Driver,Admin")]
        public async Task DriverPosition(DriverPositionPayload payload)
        {
            if (payload is null) return;

            var userId   = Context.UserIdentifier ?? string.Empty;
            var userName = Context.User?.Identity?.Name ?? string.Empty;
            var now      = DateTime.UtcNow;

            // Update server-side cache first so a snapshot fetched in the
            // same millisecond as the broadcast already reflects this point.
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
                phase      = payload.Phase,  // "start" | "move" | "stop" | "end"
                at         = now,
            };

            // Fan out to every group in parallel. Admins + drivers + citizens
            // all see live trucks; that's the whole point of this change.
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

using System;
using System.Collections.Generic;
using System.Text;

namespace BinMaps.Shared.DTOs
{
    public sealed class AuthResultDto
    {
        public string Token { get; set; } = string.Empty;
        public string UserId { get; set; } = string.Empty;
        public string UserName { get; set; } = string.Empty;
        public string Email { get; set; } = string.Empty;
        public string Role { get; set; } = string.Empty;
        public int Reputation { get; set; }

        /// <summary>True when the account is banned. Token is still issued so the
        /// frontend can show the ban page with full context, but the Angular guards
        /// will prevent access to any protected route.</summary>
        public bool IsBanned { get; set; }
        public string? BanReason { get; set; }
    }
}

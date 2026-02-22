using System.ComponentModel.DataAnnotations;

namespace BinMaps.Shared.DTOs
{
    public sealed class LoginDTO
    {
        [Required]
        [EmailAddress]
        public string Email { get; set; } = string.Empty;

        [Required]
        [MinLength(6)]
        public string Password { get; set; } = string.Empty;
    }
}

using System.ComponentModel.DataAnnotations;

namespace BinMaps.Shared.DTOs;

public sealed class RegisterDTO
{
    [Required]
    [StringLength(50, MinimumLength = 3)]
    public string UserName { get; set; } = string.Empty;

    [Required]
    [EmailAddress]
    public string Email { get; set; } = string.Empty;

    [Phone]
    public string? PhoneNumber { get; set; }

    [Required]
    [MinLength(6)]
    public string Password { get; set; } = string.Empty;

    [Required]
    [Range(typeof(bool), "true", "true", ErrorMessage = "Трябва да приемете условията.")]
    public bool AcceptTerms { get; set; }
}
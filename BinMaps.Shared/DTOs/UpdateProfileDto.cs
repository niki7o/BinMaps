using System.ComponentModel.DataAnnotations;
namespace BinMaps.Shared.DTOs;

public sealed class UpdateProfileDto
{
    [StringLength(50, MinimumLength = 3)]
    public string? UserName { get; set; }

    [EmailAddress]
    public string? Email { get; set; }

    [Phone]
    public string? PhoneNumber { get; set; }
}
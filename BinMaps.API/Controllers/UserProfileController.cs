using Microsoft.AspNetCore.Authorization;

using Microsoft.EntityFrameworkCore;
using System.Security.Claims;
using BinMaps.Data;
using Microsoft.AspNetCore.Mvc;
using BinMaps.Data.Entities;

namespace BinMaps.API.Controllers
{





    [Route("api/[controller]")]
    [ApiController]
    [Authorize]
    public class UserProfileController : ControllerBase
    {
        private readonly BinMapsDbContext _context;
        private readonly IWebHostEnvironment _environment;

        public UserProfileController(BinMapsDbContext context, IWebHostEnvironment environment)
        {
            _context = context;
            _environment = environment;
        }


        [HttpGet]
        public async Task<IActionResult> GetCurrentUserProfile()
        {
            var userId = User.FindFirstValue(ClaimTypes.NameIdentifier);
            if (string.IsNullOrEmpty(userId))
                return Unauthorized();

            var user = await _context.Users.FindAsync(userId);
            if (user == null)
                return NotFound();

            var profile = await GetUserProfileData(userId);
            return Ok(profile);
        }


        [HttpGet("{userId}")]
        public async Task<IActionResult> GetUserProfile(string userId)
        {
            var user = await _context.Users.FindAsync(userId);
            if (user == null)
                return NotFound();

            var profile = await GetUserProfileData(userId);
            return Ok(profile);
        }


        [HttpPut]
        public async Task<IActionResult> UpdateProfile([FromBody] UpdateProfileRequest request)
        {
            var userId = User.FindFirstValue(ClaimTypes.NameIdentifier);
            if (string.IsNullOrEmpty(userId))
                return Unauthorized();

            var user = await _context.Users.FindAsync(userId);
            if (user == null)
                return NotFound();

            if (!string.IsNullOrEmpty(request.UserName))
                user.UserName = request.UserName;

            if (!string.IsNullOrEmpty(request.Email))
                user.Email = request.Email;

            if (!string.IsNullOrEmpty(request.PhoneNumber))
                user.PhoneNumber = request.PhoneNumber;

            try
            {
                await _context.SaveChangesAsync();
                return Ok(new { message = "Профилът е актуализиран успешно" });
            }
            catch (Exception ex)
            {
                return BadRequest(new { error = ex.Message });
            }
        }


        [HttpPost("upload-picture")]
        [Consumes("multipart/form-data")]
        public async Task<IActionResult> UploadProfilePicture( IFormFile file)
        {
            var userId = User.FindFirstValue(ClaimTypes.NameIdentifier);
            if (string.IsNullOrEmpty(userId))
                return Unauthorized();

            if (file == null || file.Length == 0)
                return BadRequest(new { error = "Няма качен файл" });

            var allowedExtensions = new[] { ".jpg", ".jpeg", ".png", ".gif" };
            var extension = Path.GetExtension(file.FileName).ToLowerInvariant();

            if (!allowedExtensions.Contains(extension))
                return BadRequest(new { error = "Невалиден формат. Разрешени: jpg, jpeg, png, gif" });

            if (file.Length > 5 * 1024 * 1024)
                return BadRequest(new { error = "Файлът е твърде голям. Максимум 5MB" });

            try
            {
                // FIX: Handle null WebRootPath
                var webRootPath = _environment.WebRootPath;
                if (string.IsNullOrEmpty(webRootPath))
                {
                    webRootPath = Path.Combine(Directory.GetCurrentDirectory(), "wwwroot");
                }

                var uploadsFolder = Path.Combine(webRootPath, "uploads", "profiles");

                if (!Directory.Exists(uploadsFolder))
                    Directory.CreateDirectory(uploadsFolder);

                var user = await _context.Users.FindAsync(userId);
                if (user == null)
                    return NotFound();

                if (!string.IsNullOrEmpty(user.ProfilePicturePath))
                {
                    var oldFilePath = Path.Combine(webRootPath, user.ProfilePicturePath.TrimStart('/').Replace('/', Path.DirectorySeparatorChar));
                    if (System.IO.File.Exists(oldFilePath))
                    {
                        try
                        {
                            System.IO.File.Delete(oldFilePath);
                        }
                        catch (Exception delEx)
                        {
                            Console.WriteLine($"Could not delete old file: {delEx.Message}");
                        }
                    }
                }

                var fileName = $"{userId}_{Guid.NewGuid()}{extension}";
                var filePath = Path.Combine(uploadsFolder, fileName);

                using (var stream = new FileStream(filePath, FileMode.Create))
                {
                    await file.CopyToAsync(stream);
                }

                var relativePath = $"/uploads/profiles/{fileName}";
                user.ProfilePicturePath = relativePath;

                await _context.SaveChangesAsync();

                return Ok(new
                {
                    message = "Снимката е качена успешно",
                    profilePicturePath = relativePath
                });
            }
            catch (Exception ex)
            {
                Console.WriteLine($"Upload error: {ex.Message}");
                Console.WriteLine($"Stack trace: {ex.StackTrace}");
                return StatusCode(500, new { error = $"Грешка при качване: {ex.Message}" });
            }
        }


        [HttpGet("reports")]
        public async Task<IActionResult> GetUserReports()
        {
            var userId = User.FindFirstValue(ClaimTypes.NameIdentifier);
            if (string.IsNullOrEmpty(userId))
                return Unauthorized();

            var reports = await _context.Reports
                .Where(r => r.UserId == userId)
                .OrderByDescending(r => r.CreatedAt)
                .Select(r => new
                {
                    r.Id,
                    r.ReportType,
                    r.Description,
                    r.CreatedAt,
                    r.IsApproved,
                    r.AI_Score,
                    r.FinalConfidence,
                    ContainerId = r.TrashContainerId,
                    Container = r.TrashContainer != null ? new
                    {
                        r.TrashContainer.Id,
                        r.TrashContainer.AreaId,
                        r.TrashContainer.TrashType
                    } : null
                })
                .ToListAsync();

            return Ok(reports);
        }


        [HttpGet("stats")]
        public async Task<IActionResult> GetUserStats()
        {
            var userId = User.FindFirstValue(ClaimTypes.NameIdentifier);
            if (string.IsNullOrEmpty(userId))
                return Unauthorized();

            var totalReports = await _context.Reports.CountAsync(r => r.UserId == userId);
            var approvedReports = await _context.Reports.CountAsync(r => r.UserId == userId && r.IsApproved);
            var pendingReports = await _context.Reports.CountAsync(r => r.UserId == userId && !r.IsApproved);


            var reputation = CalculateReputation(approvedReports, totalReports);

            var recentReports = await _context.Reports
                .Where(r => r.UserId == userId)
                .OrderByDescending(r => r.CreatedAt)
                .Take(5)
                .Select(r => new
                {
                    r.ReportType,
                    r.CreatedAt,
                    r.IsApproved
                })
                .ToListAsync();

            return Ok(new
            {
                totalReports,
                approvedReports,
                pendingReports,
                reputation,
                recentActivity = recentReports
            });
        }


        [HttpGet("reputation")]
        public async Task<IActionResult> GetReputation()
        {
            var userId = User.FindFirstValue(ClaimTypes.NameIdentifier);
            if (string.IsNullOrEmpty(userId))
                return Unauthorized();

            var totalReports = await _context.Reports.CountAsync(r => r.UserId == userId);
            var approvedReports = await _context.Reports.CountAsync(r => r.UserId == userId && r.IsApproved);

            var reputation = CalculateReputation(approvedReports, totalReports);
            var level = GetReputationLevel(reputation);
            var nextLevel = GetNextLevelThreshold(level);

            return Ok(new
            {
                reputation,
                level,
                nextLevel,
                progress = nextLevel > 0 ? (double)reputation / nextLevel * 100 : 100
            });
        }


        [HttpDelete("picture")]
        public async Task<IActionResult> DeleteProfilePicture()
        {
            var userId = User.FindFirstValue(ClaimTypes.NameIdentifier);
            if (string.IsNullOrEmpty(userId))
                return Unauthorized();

            var user = await _context.Users.FindAsync(userId);
            if (user == null)
                return NotFound();

            if (!string.IsNullOrEmpty(user.ProfilePicturePath))
            {
                var filePath = Path.Combine(_environment.WebRootPath, user.ProfilePicturePath.TrimStart('/'));
                if (System.IO.File.Exists(filePath))
                    System.IO.File.Delete(filePath);

                user.ProfilePicturePath = null;
                await _context.SaveChangesAsync();
            }

            return Ok(new { message = "Снимката е изтрита" });
        }



        private async Task<object> GetUserProfileData(string userId)
        {
            var user = await _context.Users.FindAsync(userId);
            if (user == null)
                return null!;

            var totalReports = await _context.Reports.CountAsync(r => r.UserId == userId);
            var approvedReports = await _context.Reports.CountAsync(r => r.UserId == userId && r.IsApproved);
            var reputation = CalculateReputation(approvedReports, totalReports);
            var level = GetReputationLevel(reputation);

            return new
            {
                userId = user.Id,
                userName = user.UserName,
                email = user.Email,
                phoneNumber = user.PhoneNumber,
                profilePicturePath = user.ProfilePicturePath,
                role = GetUserRole(user),
                totalReports,
                approvedReports,
                reputation,
                level,
                memberSince = user.CreatedAt
            };
        }

        private int CalculateReputation(int approvedReports, int totalReports)
        {
            if (totalReports == 0)
                return 0;


            var baseReputation = approvedReports * 10;


            var accuracy = (double)approvedReports / totalReports;
            var accuracyBonus = accuracy >= 0.9 ? (int)(baseReputation * 0.5) :
                                accuracy >= 0.8 ? (int)(baseReputation * 0.3) :
                                accuracy >= 0.7 ? (int)(baseReputation * 0.1) : 0;


            var volumeBonus = totalReports >= 100 ? 100 :
                             totalReports >= 50 ? 50 :
                             totalReports >= 25 ? 25 : 0;

            return baseReputation + accuracyBonus + volumeBonus;
        }

        private string GetReputationLevel(int reputation)
        {
            if (reputation >= 1000) return "Легенда";
            if (reputation >= 500) return "Експерт";
            if (reputation >= 250) return "Професионалист";
            if (reputation >= 100) return "Опитен";
            if (reputation >= 50) return "Активен";
            return "Начинаещ";
        }

        private int GetNextLevelThreshold(string level)
        {
            return level switch
            {
                "Начинаещ" => 50,
                "Активен" => 100,
                "Опитен" => 250,
                "Професионалист" => 500,
                "Експерт" => 1000,
                "Легенда" => 0,
                _ => 50
            };
        }

        private string GetUserRole(User user)
        {

            return "User";
        }
    }



    public class UpdateProfileRequest
    {
        public string? UserName { get; set; }
        public string? Email { get; set; }
        public string? PhoneNumber { get; set; }
    }
}
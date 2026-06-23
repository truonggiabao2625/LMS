using LMS.Api.Infrastructure.Persistence;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace LMS.Api.Controllers;

/// <summary>Controller hệ thống — health check, trang chủ API</summary>
[ApiController]
public class HeThongController : ControllerBase
{
    [HttpGet("/")]
    [HttpHead("/")]
    public IActionResult TrangChu() => Content("LMS API đang chạy!");

    [HttpGet("/health")]
    public IActionResult KiemTraSucKhoe() => Ok(new { status = "ok", time = DateTime.UtcNow });

    [HttpGet("/debug-users")]
    public async Task<IActionResult> DebugUsers([FromServices] ApplicationDbContext db, [FromQuery] bool reset = false)
    {
        var users = await db.NguoiDung.ToListAsync();
        if (users.Count == 0 || reset)
        {
            if (reset)
            {
                // Clear existing database to re-seed cleanly
                db.NguoiDung.RemoveRange(users);
                await db.SaveChangesAsync();
            }
            await SeedData.SeedAsync(db);
            users = await db.NguoiDung.ToListAsync();
            return Ok(new { message = "Database seeded/reset successfully!", users = users.Select(u => new { u.Email, u.VaiTro, u.Ten }) });
        }
        
        // Check if any user's password does not look like a BCrypt hash (usually starts with $2)
        bool needsReset = users.Any(u => string.IsNullOrWhiteSpace(u.MatKhau) || !u.MatKhau.StartsWith("$2"));
        if (needsReset)
        {
            foreach (var u in users)
            {
                u.MatKhau = BCrypt.Net.BCrypt.HashPassword("123456");
            }
            await db.SaveChangesAsync();
            return Ok(new { message = "Detected old plain-text or invalid hashed passwords. All passwords reset to '123456' successfully using BCrypt!", users = users.Select(u => new { u.Email, u.VaiTro, u.Ten }) });
        }

        return Ok(new { message = "Current users in database (all passwords look valid!):", users = users.Select(u => new { u.Email, u.VaiTro, u.Ten }) });
    }
}

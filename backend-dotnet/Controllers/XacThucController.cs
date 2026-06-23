using System.Security.Claims;
using Microsoft.AspNetCore.Authentication;
using LMS.Api.DTOs.YeuCau;
using LMS.Api.Application.Services;
using Microsoft.AspNetCore.Mvc;

namespace LMS.Api.Controllers;

/// <summary>Controller xác thực: đăng ký, đăng nhập, đăng xuất.</summary>
[ApiController]
public class XacThucController(IDichVuXacThuc dichVu, IConfiguration cauHinh) : ControllerBase
{
    private string FrontendUrl => cauHinh["FRONTEND_URL"] ?? "http://localhost:5173";
    private bool GoogleDaDuocCauHinh =>
        !string.IsNullOrWhiteSpace(FirstConfigured(cauHinh["GOOGLE_CLIENT_ID"], cauHinh["Authentication:Google:ClientId"])) &&
        !string.IsNullOrWhiteSpace(FirstConfigured(cauHinh["GOOGLE_CLIENT_SECRET"], cauHinh["Authentication:Google:ClientSecret"]));

    private static string? FirstConfigured(params string?[] values) =>
        values.FirstOrDefault(value => !string.IsNullOrWhiteSpace(value));

    private void LuuTokenVaoCookie(string token)
    {
        Response.Cookies.Append("LmsAuthToken", token, new CookieOptions
        {
            HttpOnly = true,
            SameSite = SameSiteMode.Lax,
            Secure = false,
            Expires = DateTimeOffset.UtcNow.AddDays(7)
        });
    }

    /// <summary>Đăng ký tài khoản mới.</summary>
    [HttpPost("/api/auth/register")]
    public async Task<IResult> DangKy([FromBody] DangKyRequest yeuCau)
    {
        var (thanhCong, loi, ketQua) = await dichVu.DangKyAsync(yeuCau.Email, yeuCau.Password, yeuCau.Name);
        if (!thanhCong) return Results.Conflict(new { message = loi });
        if (ketQua is not null) LuuTokenVaoCookie(ketQua.Token);
        return Results.Created("/api/user/me", ketQua);
    }

    /// <summary>Đăng nhập bằng email và mật khẩu.</summary>
    [HttpPost("/api/auth/login")]
    public async Task<IResult> DangNhap([FromBody] DangNhapRequest yeuCau)
    {
        var (thanhCong, ketQua) = await dichVu.DangNhapAsync(yeuCau.Email, yeuCau.Password);
        if (thanhCong && ketQua is not null) LuuTokenVaoCookie(ketQua.Token);
        return thanhCong
            ? Results.Ok(ketQua)
            : Results.Json(new { message = "Email hoặc mật khẩu không đúng." }, statusCode: 401);
    }

    /// <summary>Đăng xuất và xóa cookie xác thực dùng cho MVC.</summary>
    [HttpPost("/api/auth/logout")]
    public IResult DangXuat()
    {
        Response.Cookies.Delete("LmsAuthToken");
        return Results.Ok(new { message = "Đã đăng xuất" });
    }

    [HttpGet("/api/auth/providers")]
    public IResult NhaCungCap()
    {
        return Results.Ok(new { google = GoogleDaDuocCauHinh });
    }

    [HttpGet("/api/auth/social/{provider}")]
    public IResult DangNhapMangXaHoi(string provider)
    {
        var scheme = provider.ToLowerInvariant() switch
        {
            "google" when GoogleDaDuocCauHinh => "Google",
            _ => null
        };
        if (scheme is null) return Results.BadRequest(new { message = $"Đăng nhập {provider} chưa được cấu hình." });

        var properties = new AuthenticationProperties
        {
            RedirectUri = $"/api/auth/social-callback?provider={Uri.EscapeDataString(provider)}"
        };
        return Results.Challenge(properties, [scheme]);
    }

    [HttpGet("/api/auth/social-callback")]
    public async Task<IResult> HoanTatDangNhapMangXaHoi(string provider)
    {
        var result = await HttpContext.AuthenticateAsync("External");
        if (!result.Succeeded || result.Principal is null)
            return Results.Redirect($"{FrontendUrl}/oauth-callback?error={Uri.EscapeDataString($"Không thể đăng nhập bằng {provider}.")}");

        var email = result.Principal.FindFirstValue(ClaimTypes.Email);
        var name = result.Principal.FindFirstValue(ClaimTypes.Name);
        if (string.IsNullOrWhiteSpace(email))
            return Results.Redirect($"{FrontendUrl}/oauth-callback?error={Uri.EscapeDataString("Tài khoản mạng xã hội không cung cấp email.")}");

        var ketQua = await dichVu.DangNhapMangXaHoiAsync(email, name);
        LuuTokenVaoCookie(ketQua.Token);
        await HttpContext.SignOutAsync("External");
        return Results.Redirect($"{FrontendUrl}/oauth-callback?token={Uri.EscapeDataString(ketQua.Token)}");
    }
}

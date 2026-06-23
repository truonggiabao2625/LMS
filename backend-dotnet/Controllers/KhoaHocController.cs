using LMS.Api.Infrastructure.Persistence;
using LMS.Api.DTOs.YeuCau;
using LMS.Api.Application.Services;
using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace LMS.Api.Controllers;

/// <summary>Controller khóa học — danh sách, chi tiết, đánh giá</summary>
[ApiController]
public class KhoaHocController(IDichVuKhoaHoc dichVu, ApplicationDbContext db) : ControllerBase
{
    /// <summary>Danh sách khóa học công khai</summary>
    [HttpGet("/api/courses")]
    [HttpGet("/api/courses/published")]
    public async Task<IResult> DanhSach(
        int page = 1,
        int pageSize = 20,
        bool paginate = false,
        string? q = null,
        string? category = null,
        string? sort = null,
        string? price = null,
        string? tier = null)
    {
        var userId = TroGiup.LayUserId(User);
        return Results.Ok(await dichVu.LayDanhSachAsync(page, pageSize, paginate, q, category, sort, price, tier, userId));
    }

    [HttpGet("/api/course-categories")]
    public async Task<IResult> DanhMucKhoaHoc()
    {
        var danhMuc = await db.DanhMuc
            .AsNoTracking()
            .Where(dm => dm.HoatDong)
            .OrderBy(dm => dm.Ten)
            .Select(dm => new
            {
                id = dm.Id,
                name = dm.Ten,
                slug = dm.Slug,
                courseCount = db.KhoaHoc.Count(kh => kh.DanhMucId == dm.Id && kh.DaXuatBan)
            })
            .ToListAsync();

        return Results.Ok(danhMuc);
    }

    [HttpGet("/api/categories")]
    public async Task<IResult> LayTatCaDanhMuc()
    {
        var ds = await db.DanhMuc
            .AsNoTracking()
            .Where(dm => dm.HoatDong)
            .OrderBy(dm => dm.Ten)
            .Select(dm => new { id = dm.Id, name = dm.Ten, slug = dm.Slug })
            .ToListAsync();
        return Results.Ok(ds);
    }


    [Authorize]
    [HttpGet("/api/student/courses")]
    public async Task<IResult> DanhSachChoSinhVien(
        int page = 1,
        int pageSize = 20,
        bool paginate = false,
        string? q = null,
        string? category = null,
        string? sort = null,
        string? price = null,
        string? tier = null)
    {
        var userId = TroGiup.LayUserId(User);
        if (userId is null) return Results.Unauthorized();

        return Results.Ok(await dichVu.LayDanhSachAsync(
            page, pageSize, paginate, q, category, sort, price, tier, userId));
    }

    [HttpGet("/api/courses/trending-categories")]
    public async Task<IResult> DanhMucThinhHanh(int limit = 5)
    {
        limit = Math.Clamp(limit, 1, 20);

        var danhMuc = await db.DonMua
            .AsNoTracking()
            .Where(mua =>
                mua.TrangThai == "COMPLETED" &&
                mua.KhoaHoc != null &&
                mua.KhoaHoc.DaXuatBan &&
                mua.KhoaHoc.ChuyenMuc != "")
            .GroupBy(mua => mua.KhoaHoc!.ChuyenMuc.Trim())
            .Select(nhom => new
            {
                category = nhom.Key,
                purchaseCount = nhom.Count(),
                courseCount = nhom.Select(mua => mua.KhoaHocId).Distinct().Count()
            })
            .OrderByDescending(item => item.purchaseCount)
            .ThenBy(item => item.category)
            .Take(limit)
            .ToListAsync();

        return Results.Ok(danhMuc);
    }

    [Authorize]
    [HttpGet("/api/student/courses/recommended")]
    public async Task<IResult> KhoaHocDeXuat(int limit = 3)
    {
        var userId = TroGiup.LayUserId(User);
        if (userId is null) return Results.Unauthorized();

        limit = Math.Clamp(limit, 1, 20);

        var danhMucDaMua = db.DonMua
            .AsNoTracking()
            .Where(mua => mua.NguoiDungId == userId && mua.TrangThai == "COMPLETED" && mua.KhoaHoc != null)
            .Select(mua => mua.KhoaHoc!.ChuyenMuc);

        var khoaHoc = await db.KhoaHoc
            .AsNoTracking()
            .Where(kh =>
                kh.DaXuatBan &&
                danhMucDaMua.Contains(kh.ChuyenMuc) &&
                !kh.CacDonMua.Any(mua => mua.NguoiDungId == userId && mua.TrangThai == "COMPLETED") &&
                !kh.CacGhiDanh.Any(ghiDanh => ghiDanh.NguoiDungId == userId))
            .Select(kh => new
            {
                id = kh.Id,
                title = kh.TieuDe,
                thumbnail = kh.AnhDaiDien,
                category = kh.ChuyenMuc,
                instructorName = kh.GiangVien != null ? kh.GiangVien.Ten : "Giảng viên",
                lessonCount = kh.CacBaiHoc.Count,
                averageRating = kh.DiemDanhGiaTrungBinh,
                purchaseCount = kh.CacDonMua.Count(mua => mua.TrangThai == "COMPLETED")
            })
            .OrderByDescending(kh => kh.purchaseCount)
            .ThenByDescending(kh => kh.averageRating)
            .ThenBy(kh => kh.title)
            .Take(limit)
            .ToListAsync();

        return Results.Ok(khoaHoc);
    }

    [HttpGet("/api/explore/insights")]
    public async Task<IResult> DuLieuKhamPha()
        => Results.Ok(await dichVu.LayExploreInsightsAsync());

    /// <summary>Chi tiết một khóa học</summary>
    [HttpGet("/api/courses/{id}")]
    [HttpGet("/api/student/courses/{id}")]
    public async Task<IResult> ChiTiet(string id)
    {
        var kq = await dichVu.LayChiTietAsync(id, LayNguoiDungTheoCheDoXem());
        return kq is null ? Results.NotFound(new { message = "Không tìm thấy khóa học" }) : Results.Ok(kq);
    }

    [HttpGet("/api/student/courses/{id}/preview-lessons")]
    public async Task<IResult> BaiHocThu(string id)
    {
        var kq = await dichVu.LayBaiHocThuAsync(id);
        return kq is null ? Results.NotFound(new { message = "Không tìm thấy khóa học" }) : Results.Ok(kq);
    }

    [Authorize]
    [HttpGet("/api/student/courses/{id}/learning")]
    public async Task<IResult> KhoaHocDangHoc(string id)
    {
        var kq = await dichVu.LayKhoaHocDangHocAsync(id, LayNguoiDungTheoCheDoXem());
        return kq is null
            ? Results.Json(new { message = "Bạn chưa ghi danh hoặc không có quyền truy cập khóa học này" }, statusCode: 403)
            : Results.Ok(kq);
    }

    [Authorize]
    [HttpGet("/api/student/lessons/{lessonId}")]
    public async Task<IResult> ChiTietBaiHoc(string lessonId)
    {
        var kq = await dichVu.LayChiTietBaiHocAsync(lessonId, LayNguoiDungTheoCheDoXem());
        return kq is null ? Results.NotFound(new { message = "Không tìm thấy bài học" }) : Results.Ok(kq);
    }

    private ClaimsPrincipal LayNguoiDungTheoCheDoXem()
    {
        if (Request.Headers["X-Student-Preview"] != "true" || !(User.IsInRole("INSTRUCTOR") || User.IsInRole("ADMIN")))
            return User;

        var identity = new ClaimsIdentity(User.Claims, User.Identity?.AuthenticationType);
        identity.AddClaim(new Claim("StudentPreview", "true"));
        return new ClaimsPrincipal(identity);
    }

    /// <summary>Danh sách đánh giá khóa học</summary>
    [HttpGet("/api/courses/{id}/reviews")]
    public async Task<IResult> DanhGia(string id)
    {
        var kq = await dichVu.LayDanhGiaAsync(id);
        return kq is null ? Results.NotFound(new { message = "Không tìm thấy khóa học" }) : Results.Ok(kq);
    }

    /// <summary>Gửi đánh giá khóa học</summary>
    [Authorize]
    [HttpPost("/api/courses/{id}/reviews")]
    public async Task<IResult> GuiDanhGia(string id, [FromBody] DanhGiaRequest yeuCau)
    {
        var userId = TroGiup.LayUserId(User);
        if (userId is null) return Results.Unauthorized();
        return await dichVu.GuiDanhGiaAsync(id, userId, yeuCau.Rating, yeuCau.Comment);
    }

    [HttpDelete("/api/courses/{id}/reviews/me")]
    public async Task<IResult> XoaDanhGia(string id)
    {
        var userId = TroGiup.LayUserId(User);
        if (userId is null) return Results.Unauthorized();
        return await dichVu.XoaDanhGiaAsync(id, userId);
    }

    [Authorize]
    [HttpGet("/api/courses/{courseId}/lessons/{lessonId}/download")]
    public async Task<IActionResult> DownloadTaiLieu(string courseId, string lessonId, [FromServices] Microsoft.AspNetCore.Hosting.IWebHostEnvironment env)
    {
        var userId = TroGiup.LayUserId(User);
        if (userId is null) return Unauthorized();

        var course = await db.KhoaHoc.AsNoTracking().FirstOrDefaultAsync(c => c.Id == courseId);
        if (course is null) return NotFound(new { message = "Khóa học không tồn tại" });

        var isFree = course.Gia == 0;
        var isInstructor = course.GiangVienId == userId;
        var isAdmin = User.IsInRole("ADMIN");
        var isEnrolled = await db.GhiDanh.AnyAsync(e => e.NguoiDungId == userId && e.KhoaHocId == courseId);

        if (!isFree && !isInstructor && !isAdmin && !isEnrolled)
        {
            return StatusCode(403, new { message = "Bạn cần mua hoặc ghi danh khóa học để tải tài liệu này." });
        }

        var lesson = await db.BaiHoc.AsNoTracking().FirstOrDefaultAsync(l => l.Id == lessonId && l.KhoaHocId == courseId);
        if (lesson is null) return NotFound(new { message = "Bài học không tồn tại" });

        if (string.IsNullOrWhiteSpace(lesson.FileUrl))
        {
            return NotFound(new { message = "Bài học này không có tài liệu đính kèm." });
        }

        var fileUrl = lesson.FileUrl.TrimStart('/');
        var webRootPath = env.WebRootPath ?? Path.Combine(Directory.GetCurrentDirectory(), "wwwroot");
        var filePath = Path.Combine(webRootPath, fileUrl);

        if (!System.IO.File.Exists(filePath))
        {
            var alternatePath = Path.Combine(Directory.GetCurrentDirectory(), "wwwroot", fileUrl);
            if (!System.IO.File.Exists(alternatePath))
            {
                alternatePath = Path.Combine(Directory.GetCurrentDirectory(), fileUrl);
                if (!System.IO.File.Exists(alternatePath))
                {
                    return NotFound(new { message = "Tài liệu không tồn tại" });
                }
                filePath = alternatePath;
            }
            else
            {
                filePath = alternatePath;
            }
        }

        var contentType = "application/octet-stream";
        if (filePath.EndsWith(".pdf", StringComparison.OrdinalIgnoreCase)) contentType = "application/pdf";
        else if (filePath.EndsWith(".docx", StringComparison.OrdinalIgnoreCase)) contentType = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
        else if (filePath.EndsWith(".zip", StringComparison.OrdinalIgnoreCase)) contentType = "application/zip";

        var fileName = Path.GetFileName(filePath);
        var fileBytes = await System.IO.File.ReadAllBytesAsync(filePath);
        return File(fileBytes, contentType, fileName);
    }
}

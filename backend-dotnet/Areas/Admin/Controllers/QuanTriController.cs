using System.Data;
using System.Security.Claims;
using System.Text.Json;
using System.Text.Json.Nodes;
using LMS.Api.Infrastructure.Persistence;
using LMS.Api.DTOs.PhanHoi;
using LMS.Api.Domain.Entities;
using LMS.Api.Application.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace LMS.Api.Areas.Admin.Controllers;

/// <summary>Controller quản trị: quản lý người dùng, khóa học, mã giảm giá, giao dịch và nhật ký.</summary>
[ApiController]
[Authorize]
[Area("Admin")]
public class QuanTriController(ApplicationDbContext db) : ControllerBase
{
    [HttpGet("/api/admin/users")]
    public async Task<IResult> DanhSachNguoiDung(string? q = null, string? role = null, int page = 1, int pageSize = 20)
    {
        var loi = TroGiup.YeuCauAdmin(User);
        if (loi is not null) return loi;

        page = Math.Max(1, page);
        pageSize = Math.Clamp(pageSize, 1, 100);

        var query = db.NguoiDung.AsNoTracking().AsQueryable();

        if (!string.IsNullOrWhiteSpace(q))
        {
            var tuKhoa = q.Trim();
            query = query.Where(u => u.Ten.Contains(tuKhoa) || u.Email.Contains(tuKhoa));
        }

        if (!string.IsNullOrWhiteSpace(role))
        {
            var vaiTro = role.Trim().ToUpperInvariant();
            query = query.Where(u => u.VaiTro == vaiTro);
        }

        var tong = await query.CountAsync();
        var ds = await query
            .OrderByDescending(u => u.NgayTao)
            .Skip((page - 1) * pageSize)
            .Take(pageSize)
            .ToListAsync();

        var ids = ds.Select(u => u.Id).ToList();

        var coursesCounts = await db.KhoaHoc
            .Where(c => ids.Contains(c.GiangVienId))
            .GroupBy(c => c.GiangVienId)
            .Select(g => new { GiangVienId = g.Key, Count = g.Count() })
            .ToDictionaryAsync(g => g.GiangVienId, g => g.Count);

        var enrollmentsCounts = await db.GhiDanh
            .Where(e => ids.Contains(e.NguoiDungId))
            .GroupBy(e => e.NguoiDungId)
            .Select(g => new { NguoiDungId = g.Key, Count = g.Count() })
            .ToDictionaryAsync(g => g.NguoiDungId, g => g.Count);

        var purchasesCounts = await db.DonMua
            .Where(p => ids.Contains(p.NguoiDungId))
            .GroupBy(p => p.NguoiDungId)
            .Select(g => new { NguoiDungId = g.Key, Count = g.Count() })
            .ToDictionaryAsync(g => g.NguoiDungId, g => g.Count);

        var items = new List<object>();
        foreach (var u in ds)
        {
            coursesCounts.TryGetValue(u.Id, out var soKhoaHoc);
            enrollmentsCounts.TryGetValue(u.Id, out var soGhiDanh);
            purchasesCounts.TryGetValue(u.Id, out var soMuaHang);
            items.Add(NguoiDungAdminDto.TuUser(u, soKhoaHoc, soGhiDanh, soMuaHang));
        }

        return Results.Ok(TroGiup.PhanTrang(items, tong, page, pageSize));
    }

    [HttpPatch("/api/admin/users/{id}/role")]
    public async Task<IResult> DoiVaiTro(string id, [FromBody] DTOs.YeuCau.DoiVaiTroRequest yeuCau)
    {
        var loi = TroGiup.YeuCauAdmin(User);
        if (loi is not null) return loi;

        var vaiTro = new[] { "STUDENT", "INSTRUCTOR", "ADMIN" };
        if (!vaiTro.Contains(yeuCau.Role)) return Results.BadRequest(new { message = "Vai trò không hợp lệ" });

        var user = await db.NguoiDung.FirstOrDefaultAsync(u => u.Id == id);
        if (user is null) return Results.NotFound(new { message = "Không tìm thấy người dùng" });

        user.VaiTro = yeuCau.Role;
        user.NgayCapNhat = DateTime.UtcNow;
        await GhiNhatKy("UPDATE_USER_ROLE", "User", user.Id, new { user.Email, role = user.VaiTro });
        await db.SaveChangesAsync();

        var soKhoaHoc = await db.KhoaHoc.CountAsync(c => c.GiangVienId == user.Id);
        var soGhiDanh = await db.GhiDanh.CountAsync(e => e.NguoiDungId == user.Id);
        var soMuaHang = await db.DonMua.CountAsync(p => p.NguoiDungId == user.Id);
        return Results.Ok(NguoiDungAdminDto.TuUser(user, soKhoaHoc, soGhiDanh, soMuaHang));
    }

    [HttpDelete("/api/admin/users/{id}")]
    public async Task<IResult> XoaNguoiDung(string id)
    {
        var loi = TroGiup.YeuCauAdmin(User);
        if (loi is not null) return loi;

        var actorId = TroGiup.LayUserId(User);
        if (actorId == id) return Results.BadRequest(new { message = "Bạn không thể xóa chính tài khoản admin đang đăng nhập" });

        var user = await db.NguoiDung.FirstOrDefaultAsync(u => u.Id == id);
        if (user is null) return Results.NotFound(new { message = "Không tìm thấy người dùng" });

        var khoaHocIds = await db.KhoaHoc.Where(c => c.GiangVienId == id).Select(c => c.Id).ToListAsync();
        foreach (var courseId in khoaHocIds)
        {
            await XoaDuLieuKhoaHoc(courseId);
        }

        db.BinhLuan.RemoveRange(await db.BinhLuan.Where(c => c.NguoiDungId == id).ToListAsync());
        db.BaiNopKiemTra.RemoveRange(await db.BaiNopKiemTra.Where(s => s.NguoiDungId == id).ToListAsync());
        db.TienDoBaiHoc.RemoveRange(await db.TienDoBaiHoc.Where(p => p.NguoiDungId == id).ToListAsync());
        db.DanhGiaKhoaHoc.RemoveRange(await db.DanhGiaKhoaHoc.Where(r => r.NguoiDungId == id).ToListAsync());
        db.ChungChi.RemoveRange(await db.ChungChi.Where(c => c.NguoiDungId == id).ToListAsync());
        db.GhiDanh.RemoveRange(await db.GhiDanh.Where(e => e.NguoiDungId == id).ToListAsync());
        db.DonMua.RemoveRange(await db.DonMua.Where(p => p.NguoiDungId == id).ToListAsync());
        db.GiaoDichVi.RemoveRange(await db.GiaoDichVi.Where(t => t.NguoiDungId == id).ToListAsync());
        db.ThanhToan.RemoveRange(await db.ThanhToan.Where(p => p.NguoiDungId == id).ToListAsync());
        db.ThongBao.RemoveRange(await db.ThongBao.Where(n => n.NguoiDungId == id).ToListAsync());
        db.DangKySuKien.RemoveRange(await db.DangKySuKien.Where(r => r.NguoiDungId == id).ToListAsync());
        db.DoiThuongSuKien.RemoveRange(await db.DoiThuongSuKien.Where(r => r.NguoiDungId == id).ToListAsync());
        db.SuKien.RemoveRange(await db.SuKien.Where(e => e.GiangVienId == id).ToListAsync());

        db.NguoiDung.Remove(user);
        await GhiNhatKy("DELETE_USER", "User", user.Id, new { user.Email, user.VaiTro });
        await db.SaveChangesAsync();

        return Results.Ok(new { message = "Đã xóa người dùng" });
    }

    [HttpGet("/api/admin/instructor-applications")]
    public async Task<IResult> DanhSachHoSoGiangVien(string? status = null, int page = 1, int pageSize = 20)
    {
        var loi = TroGiup.YeuCauAdmin(User);
        if (loi is not null) return loi;

        page = Math.Max(1, page);
        pageSize = Math.Clamp(pageSize, 1, 100);
        var trangThai = string.IsNullOrWhiteSpace(status) ? "PENDING" : status.Trim().ToUpperInvariant();

        var users = await db.NguoiDung.AsNoTracking()
            .Where(user => !string.IsNullOrWhiteSpace(user.CaiDat))
            .OrderByDescending(user => user.NgayCapNhat)
            .ToListAsync();

        var applications = users
            .Select(TaoHoSoGiangVienDto)
            .Where(item => item is not null)
            .Select(item => item!)
            .Where(item => trangThai == "ALL" || item.Status == trangThai)
            .OrderByDescending(item => item.SubmittedAt ?? DateTime.MinValue)
            .ThenBy(item => item.FullName)
            .ToList();

        var items = applications
            .Skip((page - 1) * pageSize)
            .Take(pageSize)
            .ToList();

        return Results.Ok(TroGiup.PhanTrang(items, applications.Count, page, pageSize));
    }

    [HttpPost("/api/admin/instructor-applications/{id}/approve")]
    public async Task<IResult> PheDuyetHoSoGiangVien(string id)
    {
        var loi = TroGiup.YeuCauAdmin(User);
        if (loi is not null) return loi;

        var user = await db.NguoiDung.FirstOrDefaultAsync(item => item.Id == id);
        if (user is null) return Results.NotFound(new { message = "Khong tim thay ho so giang vien" });

        var settings = DocCaiDat(user);
        if (settings["instructorApplication"] is not JsonObject application)
            return Results.NotFound(new { message = "Nguoi dung chua co ho so dang ky giang vien" });

        application["status"] = "APPROVED";
        application["approvedAt"] = DateTime.UtcNow.ToString("O");
        application["approvedBy"] = TroGiup.LayUserId(User);
        application.Remove("rejectReason");

        user.VaiTro = "INSTRUCTOR";
        user.CaiDat = settings.ToJsonString();
        user.NgayCapNhat = DateTime.UtcNow;

        await GhiNhatKy("APPROVE_INSTRUCTOR_APPLICATION", "User", user.Id, new { user.Email });
        await db.SaveChangesAsync();

        return Results.Ok(TaoHoSoGiangVienDto(user));
    }

    [HttpPost("/api/admin/instructor-applications/{id}/reject")]
    public async Task<IResult> TuChoiHoSoGiangVien(string id, [FromBody] DTOs.YeuCau.TuChoiRequest? body)
    {
        var loi = TroGiup.YeuCauAdmin(User);
        if (loi is not null) return loi;

        var user = await db.NguoiDung.FirstOrDefaultAsync(item => item.Id == id);
        if (user is null) return Results.NotFound(new { message = "Khong tim thay ho so giang vien" });

        var settings = DocCaiDat(user);
        if (settings["instructorApplication"] is not JsonObject application)
            return Results.NotFound(new { message = "Nguoi dung chua co ho so dang ky giang vien" });

        application["status"] = "REJECTED";
        application["rejectReason"] = string.IsNullOrWhiteSpace(body?.GhiChu) ? "Ho so chua dat yeu cau" : body.GhiChu.Trim();
        application["rejectedAt"] = DateTime.UtcNow.ToString("O");
        application["rejectedBy"] = TroGiup.LayUserId(User);

        user.CaiDat = settings.ToJsonString();
        user.NgayCapNhat = DateTime.UtcNow;

        await GhiNhatKy("REJECT_INSTRUCTOR_APPLICATION", "User", user.Id, new { user.Email, reason = body?.GhiChu });
        await db.SaveChangesAsync();

        return Results.Ok(TaoHoSoGiangVienDto(user));
    }

    [HttpGet("/api/admin/courses")]
    public async Task<IResult> DanhSachKhoaHoc(string? q = null, string? status = null, int page = 1, int pageSize = 20)
    {
        var loi = TroGiup.YeuCauAdmin(User);
        if (loi is not null) return loi;

        page = Math.Max(1, page);
        pageSize = Math.Clamp(pageSize, 1, 100);

        var query = db.KhoaHoc.AsNoTracking()
            .Include(c => c.GiangVien)
            .Include(c => c.DanhMuc)
            .Include(c => c.CacBaiHoc)
            .Include(c => c.CacGhiDanh)
            .Include(c => c.CacDanhGia)
            .AsQueryable();

        if (!string.IsNullOrWhiteSpace(q))
        {
            var tuKhoa = q.Trim();
            query = query.Where(c =>
                c.TieuDe.Contains(tuKhoa) ||
                c.DuongDanThanThien.Contains(tuKhoa) ||
                (c.GiangVien != null && (c.GiangVien.Ten.Contains(tuKhoa) || c.GiangVien.Email.Contains(tuKhoa))));
        }

        if (!string.IsNullOrWhiteSpace(status))
        {
            var trangThai = status.Trim().ToLowerInvariant();
            if (trangThai == "published") query = query.Where(c => c.DaXuatBan || c.TrangThai == "PUBLIC");
            if (trangThai == "draft") query = query.Where(c => !c.DaXuatBan && c.TrangThai != "PUBLIC");
        }

        var tong = await query.CountAsync();
        var ds = await query
            .OrderByDescending(c => c.NgayTao)
            .Skip((page - 1) * pageSize)
            .Take(pageSize)
            .ToListAsync();

        return Results.Ok(TroGiup.PhanTrang(ds.Select(KhoaHocAdminDto.TuKhoaHoc), tong, page, pageSize));
    }

    [HttpPatch("/api/admin/courses/{id}/publication")]
    public async Task<IResult> CapNhatXuatBanKhoaHoc(string id, [FromBody] DTOs.YeuCau.XuatBanRequest yeuCau)
    {
        var loi = TroGiup.YeuCauAdmin(User);
        if (loi is not null) return loi;

        var kh = await db.KhoaHoc
            .Include(c => c.GiangVien)
            .Include(c => c.DanhMuc)
            .Include(c => c.CacBaiHoc)
            .Include(c => c.CacGhiDanh)
            .Include(c => c.CacDanhGia)
            .FirstOrDefaultAsync(c => c.Id == id);
        if (kh is null) return Results.NotFound(new { message = "Không tìm thấy khóa học" });

        kh.DaXuatBan = yeuCau.IsPublished;
        kh.TrangThai = yeuCau.IsPublished ? "PUBLIC" : "DRAFT";
        kh.NgayXuatBan = yeuCau.IsPublished ? DateTime.UtcNow : kh.NgayXuatBan;
        if (yeuCau.IsPublished) kh.LyDoTuChoi = null;
        kh.NgayCapNhat = DateTime.UtcNow;

        await GhiNhatKy("UPDATE_COURSE_PUBLICATION", "Course", kh.Id, new { kh.TieuDe, kh.DaXuatBan });
        await db.SaveChangesAsync();

        return Results.Ok(KhoaHocAdminDto.TuKhoaHoc(kh));
    }

    [HttpPost("/api/admin/courses/{id}/reject")]
    public async Task<IResult> TuChoiKhoaHoc(string id, [FromBody] DTOs.YeuCau.TuChoiRequest? yeuCau)
    {
        var loi = TroGiup.YeuCauAdmin(User);
        if (loi is not null) return loi;

        var lyDo = yeuCau?.GhiChu?.Trim();
        if (string.IsNullOrWhiteSpace(lyDo))
        {
            return Results.BadRequest(new { message = "Vui lòng nhập lý do từ chối khóa học." });
        }

        var kh = await db.KhoaHoc
            .Include(c => c.GiangVien)
            .Include(c => c.DanhMuc)
            .Include(c => c.CacBaiHoc)
            .Include(c => c.CacGhiDanh)
            .Include(c => c.CacDanhGia)
            .FirstOrDefaultAsync(c => c.Id == id);
        if (kh is null) return Results.NotFound(new { message = "Không tìm thấy khóa học" });

        kh.DaXuatBan = false;
        kh.TrangThai = "REJECTED";
        kh.LyDoTuChoi = lyDo.Length > 1000 ? lyDo[..1000] : lyDo;
        kh.NgayCapNhat = DateTime.UtcNow;

        await GhiNhatKy("REJECT_COURSE", "Course", kh.Id, new { kh.TieuDe, kh.LyDoTuChoi });
        await db.SaveChangesAsync();

        return Results.Ok(KhoaHocAdminDto.TuKhoaHoc(kh));
    }

    [HttpDelete("/api/admin/courses/{id}")]
    public async Task<IResult> XoaKhoaHoc(string id)
    {
        var loi = TroGiup.YeuCauAdmin(User);
        if (loi is not null) return loi;

        var tonTai = await db.KhoaHoc.AnyAsync(c => c.Id == id);
        if (!tonTai) return Results.NotFound(new { message = "Không tìm thấy khóa học" });

        return Results.Json(
            new { message = "Admin chỉ được xem, duyệt hoặc từ chối khóa học; không được xóa khóa học của giảng viên." },
            statusCode: StatusCodes.Status403Forbidden);
    }

    [HttpGet("/api/admin/categories")]
    public async Task<IResult> DanhSachDanhMuc(string? q = null)
    {
        var loi = TroGiup.YeuCauAdmin(User);
        if (loi is not null) return loi;

        var query = db.DanhMuc.AsNoTracking().AsQueryable();

        if (!string.IsNullOrWhiteSpace(q))
        {
            var cleanQuery = q.Trim().ToLower();
            query = query.Where(dm => dm.Ten.ToLower().Contains(cleanQuery) || (dm.MoTa != null && dm.MoTa.ToLower().Contains(cleanQuery)));
        }

        var categoriesList = await query.ToListAsync();

        var categoryStats = await db.KhoaHoc
            .AsNoTracking()
            .Where(c => c.DanhMucId != null)
            .Select(c => new
            {
                c.DanhMucId,
                c.DaXuatBan,
                c.TrangThai,
                StudentIds = c.CacGhiDanh.Select(e => e.NguoiDungId)
            })
            .ToListAsync();

        var statsGrouped = categoryStats
            .GroupBy(c => c.DanhMucId)
            .ToDictionary(
                g => g.Key!,
                g => new
                {
                    courseCount = g.Count(),
                    publishedCount = g.Count(c => c.DaXuatBan || c.TrangThai == "PUBLIC"),
                    studentCount = g.SelectMany(c => c.StudentIds).Distinct().Count()
                }
            );

        var result = categoriesList.Select(dm =>
        {
            statsGrouped.TryGetValue(dm.Id, out var stats);
            return new
            {
                id = dm.Id,
                name = dm.Ten,
                slug = dm.Slug,
                moTa = dm.MoTa,
                hoatDong = dm.HoatDong,
                courseCount = stats?.courseCount ?? 0,
                publishedCount = stats?.publishedCount ?? 0,
                studentCount = stats?.studentCount ?? 0
            };
        })
        .OrderByDescending(item => item.courseCount)
        .ThenBy(item => item.name)
        .ToList();

        return Results.Ok(result);
    }

    [HttpPost("/api/admin/categories")]
    public async Task<IResult> TaoDanhMuc([FromBody] DTOs.YeuCau.TaoDanhMucRequest yeuCau)
    {
        var loi = TroGiup.YeuCauAdmin(User);
        if (loi is not null) return loi;

        var name = yeuCau.Ten?.Trim();
        if (string.IsNullOrWhiteSpace(name))
        {
            return Results.BadRequest(new { message = "Tên danh mục không được để trống." });
        }

        if (await db.DanhMuc.AnyAsync(dm => dm.Ten.ToLower() == name.ToLower()))
        {
            return Results.Conflict(new { message = "Tên danh mục này đã tồn tại." });
        }

        var baseSlug = TroGiup.TaoSlug(name);
        var slug = baseSlug;
        int count = 1;
        while (await db.DanhMuc.AnyAsync(dm => dm.Slug == slug))
        {
            slug = $"{baseSlug}-{count++}";
        }

        var now = DateTime.UtcNow;
        var category = new DanhMuc
        {
            Id = Guid.NewGuid().ToString("N"),
            Ten = name,
            Slug = slug,
            MoTa = yeuCau.MoTa?.Trim(),
            HoatDong = true,
            NgayTao = now,
            NgayCapNhat = now
        };

        db.DanhMuc.Add(category);
        await GhiNhatKy("CREATE_CATEGORY", "Category", category.Id, new { category.Ten, category.Slug });
        await db.SaveChangesAsync();

        return Results.Created($"/api/admin/categories/{category.Id}", new
        {
            id = category.Id,
            name = category.Ten,
            slug = category.Slug,
            moTa = category.MoTa,
            hoatDong = category.HoatDong,
            courseCount = 0,
            publishedCount = 0,
            studentCount = 0
        });
    }

    [HttpPut("/api/admin/categories/{id}")]
    public async Task<IResult> CapNhatDanhMuc(string id, [FromBody] DTOs.YeuCau.TaoDanhMucRequest yeuCau)
    {
        var loi = TroGiup.YeuCauAdmin(User);
        if (loi is not null) return loi;

        var category = await db.DanhMuc.FirstOrDefaultAsync(dm => dm.Id == id);
        if (category is null) return Results.NotFound(new { message = "Không tìm thấy danh mục" });

        // Check if category has courses
        var hasCourses = await db.KhoaHoc.AnyAsync(c => c.DanhMucId == id);
        if (hasCourses)
        {
            return Results.BadRequest(new { message = "Không thể sửa vì danh mục đang có khóa học" });
        }

        var name = yeuCau.Ten?.Trim();
        if (string.IsNullOrWhiteSpace(name))
        {
            return Results.BadRequest(new { message = "Tên danh mục không được để trống." });
        }

        if (await db.DanhMuc.AnyAsync(dm => dm.Ten.ToLower() == name.ToLower() && dm.Id != id))
        {
            return Results.Conflict(new { message = "Tên danh mục này đã tồn tại." });
        }

        if (category.Ten != name)
        {
            category.Ten = name;
            var baseSlug = TroGiup.TaoSlug(name);
            var slug = baseSlug;
            int count = 1;
            while (await db.DanhMuc.AnyAsync(dm => dm.Slug == slug && dm.Id != id))
            {
                slug = $"{baseSlug}-{count++}";
            }
            category.Slug = slug;
        }

        category.MoTa = yeuCau.MoTa?.Trim();
        category.NgayCapNhat = DateTime.UtcNow;

        await GhiNhatKy("UPDATE_CATEGORY", "Category", category.Id, new { category.Ten, category.Slug });
        await db.SaveChangesAsync();

        return Results.Ok(new
        {
            id = category.Id,
            name = category.Ten,
            slug = category.Slug,
            moTa = category.MoTa,
            hoatDong = category.HoatDong,
            courseCount = 0,
            publishedCount = 0,
            studentCount = 0
        });
    }

    [HttpDelete("/api/admin/categories/{id}")]
    public async Task<IResult> XoaDanhMuc(string id)
    {
        var loi = TroGiup.YeuCauAdmin(User);
        if (loi is not null) return loi;

        var category = await db.DanhMuc.FirstOrDefaultAsync(dm => dm.Id == id);
        if (category is null) return Results.NotFound(new { message = "Không tìm thấy danh mục" });

        // Check if category has courses
        var hasCourses = await db.KhoaHoc.AnyAsync(c => c.DanhMucId == id);
        if (hasCourses)
        {
            return Results.BadRequest(new { message = "Không thể xóa vì danh mục đang có khóa học" });
        }

        db.DanhMuc.Remove(category);
        await GhiNhatKy("DELETE_CATEGORY", "Category", category.Id, new { category.Ten, category.Slug });
        await db.SaveChangesAsync();

        return Results.Ok(new { message = "Đã xóa danh mục thành công" });
    }

    [HttpGet("/api/admin/coupons")]
    public async Task<IResult> DanhSachMaGiam(string? q = null, string? status = null, int page = 1, int pageSize = 20)
    {
        var loi = TroGiup.YeuCauAdmin(User);
        if (loi is not null) return loi;

        page = Math.Max(1, page);
        pageSize = Math.Clamp(pageSize, 1, 100);

        var query = db.MaGiamGia.AsNoTracking().Include(c => c.KhoaHoc).AsQueryable();

        if (!string.IsNullOrWhiteSpace(q))
        {
            var tuKhoa = q.Trim();
            query = query.Where(c => c.Ma.Contains(tuKhoa) || (c.KhoaHoc != null && c.KhoaHoc.TieuDe.Contains(tuKhoa)));
        }

        if (!string.IsNullOrWhiteSpace(status))
        {
            var trangThai = status.Trim().ToLowerInvariant();
            if (trangThai == "active") query = query.Where(c => c.HoatDong);
            if (trangThai == "inactive") query = query.Where(c => !c.HoatDong);
        }

        var tong = await query.CountAsync();
        var ds = await query
            .OrderByDescending(c => c.NgayTao)
            .Skip((page - 1) * pageSize)
            .Take(pageSize)
            .ToListAsync();

        return Results.Ok(TroGiup.PhanTrang(ds.Select(MaGiamGiaDto.TuCoupon), tong, page, pageSize));
    }

    [HttpPost("/api/admin/coupons")]
    public async Task<IResult> TaoMaGiam([FromBody] DTOs.YeuCau.TaoMaGiamGiaRequest yeuCau)
    {
        var loi = TroGiup.YeuCauAdmin(User);
        if (loi is not null) return loi;

        if (string.IsNullOrWhiteSpace(yeuCau.Code)) return Results.BadRequest(new { message = "Mã giảm giá không được để trống" });

        var maChuan = yeuCau.Code.Trim().ToUpperInvariant();
        if (await db.MaGiamGia.AnyAsync(c => c.Ma == maChuan)) return Results.Conflict(new { message = "Mã giảm giá đã tồn tại" });

        if (!string.IsNullOrWhiteSpace(yeuCau.CourseId) && !await db.KhoaHoc.AnyAsync(c => c.Id == yeuCau.CourseId))
        {
            return Results.BadRequest(new { message = "Khóa học áp dụng không tồn tại" });
        }

        var now = DateTime.UtcNow;
        var coupon = new MaGiamGia
        {
            Id = TaoId.Moi(),
            Ma = maChuan,
            DiscountType = yeuCau.DiscountType ?? "PERCENTAGE",
            DiscountValue = yeuCau.DiscountValue,
            MinPurchaseAmount = yeuCau.MinPurchaseAmount ?? 0,
            MaxDiscountAmount = yeuCau.MaxDiscountAmount,
            StartDate = yeuCau.StartDate,
            EndDate = yeuCau.EndDate,
            UsageLimit = yeuCau.UsageLimit,
            KhoaHocId = string.IsNullOrWhiteSpace(yeuCau.CourseId) ? null : yeuCau.CourseId,
            HoatDong = true,
            NgayTao = now,
            NgayCapNhat = now
        };

        db.MaGiamGia.Add(coupon);
        await GhiNhatKy("CREATE_COUPON", "Coupon", coupon.Id, new { coupon.Ma, coupon.DiscountType, coupon.DiscountValue });
        await db.SaveChangesAsync();

        var daLuu = await db.MaGiamGia.AsNoTracking().Include(c => c.KhoaHoc).FirstAsync(c => c.Id == coupon.Id);
        return Results.Created($"/api/admin/coupons/{coupon.Id}", MaGiamGiaDto.TuCoupon(daLuu));
    }

    [HttpPut("/api/admin/coupons/{id}")]
    public async Task<IResult> CapNhatMaGiam(string id, [FromBody] DTOs.YeuCau.TaoMaGiamGiaRequest yeuCau)
    {
        var loi = TroGiup.YeuCauAdmin(User);
        if (loi is not null) return loi;

        var coupon = await db.MaGiamGia.Include(c => c.KhoaHoc).FirstOrDefaultAsync(c => c.Id == id);
        if (coupon is null) return Results.NotFound(new { message = "Không tìm thấy mã giảm giá" });

        if (!string.IsNullOrWhiteSpace(yeuCau.Code))
        {
            var maChuan = yeuCau.Code.Trim().ToUpperInvariant();
            if (await db.MaGiamGia.AnyAsync(c => c.Ma == maChuan && c.Id != id)) return Results.Conflict(new { message = "Mã giảm giá đã tồn tại" });
            coupon.Ma = maChuan;
        }

        if (yeuCau.DiscountType is not null) coupon.DiscountType = yeuCau.DiscountType;
        coupon.DiscountValue = yeuCau.DiscountValue;
        if (yeuCau.MinPurchaseAmount is not null) coupon.MinPurchaseAmount = yeuCau.MinPurchaseAmount.Value;
        coupon.MaxDiscountAmount = yeuCau.MaxDiscountAmount;
        coupon.StartDate = yeuCau.StartDate;
        coupon.EndDate = yeuCau.EndDate;
        coupon.UsageLimit = yeuCau.UsageLimit;
        coupon.KhoaHocId = string.IsNullOrWhiteSpace(yeuCau.CourseId) ? null : yeuCau.CourseId;
        coupon.NgayCapNhat = DateTime.UtcNow;

        await GhiNhatKy("UPDATE_COUPON", "Coupon", coupon.Id, new { coupon.Ma });
        await db.SaveChangesAsync();

        await db.Entry(coupon).Reference(c => c.KhoaHoc).LoadAsync();
        return Results.Ok(MaGiamGiaDto.TuCoupon(coupon));
    }

    [HttpPatch("/api/admin/coupons/{id}/toggle")]
    public async Task<IResult> DoiTrangThaiMaGiam(string id)
    {
        var loi = TroGiup.YeuCauAdmin(User);
        if (loi is not null) return loi;

        var coupon = await db.MaGiamGia.Include(c => c.KhoaHoc).FirstOrDefaultAsync(c => c.Id == id);
        if (coupon is null) return Results.NotFound(new { message = "Không tìm thấy mã giảm giá" });

        coupon.HoatDong = !coupon.HoatDong;
        coupon.NgayCapNhat = DateTime.UtcNow;

        await GhiNhatKy("TOGGLE_COUPON", "Coupon", coupon.Id, new { coupon.Ma, coupon.HoatDong });
        await db.SaveChangesAsync();

        return Results.Ok(MaGiamGiaDto.TuCoupon(coupon));
    }

    [HttpDelete("/api/admin/coupons/{id}")]
    public async Task<IResult> XoaMaGiam(string id)
    {
        var loi = TroGiup.YeuCauAdmin(User);
        if (loi is not null) return loi;

        var coupon = await db.MaGiamGia.FirstOrDefaultAsync(c => c.Id == id);
        if (coupon is null) return Results.NotFound(new { message = "Không tìm thấy mã giảm giá" });

        db.MaGiamGia.Remove(coupon);
        await GhiNhatKy("DELETE_COUPON", "Coupon", coupon.Id, new { coupon.Ma });
        await db.SaveChangesAsync();

        return Results.Ok(new { message = "Đã xóa mã giảm giá" });
    }

    [HttpGet("/api/admin/transactions")]
    public async Task<IResult> DanhSachGiaoDich(string? type = null, int page = 1, int pageSize = 20)
    {
        var loi = TroGiup.YeuCauAdmin(User);
        if (loi is not null) return loi;

        page = Math.Max(1, page);
        pageSize = Math.Clamp(pageSize, 1, 100);

        var query = db.GiaoDichVi.AsNoTracking()
            .Include(g => g.NguoiDung)
            .Include(g => g.KhoaHoc)
            .Include(g => g.DonMua)
            .Include(g => g.ThanhToan)
            .AsQueryable();

        if (!string.IsNullOrWhiteSpace(type))
        {
            var loai = type.Trim().ToUpperInvariant();
            query = query.Where(g => g.LoaiGiaoDich == loai);
        }

        var tong = await query.CountAsync();
        var ds = await query
            .OrderByDescending(g => g.NgayTao)
            .Skip((page - 1) * pageSize)
            .Take(pageSize)
            .ToListAsync();

        return Results.Ok(TroGiup.PhanTrang(ds.Select(GiaoDichDto.TuGiaoDich), tong, page, pageSize));
    }

    [HttpGet("/api/admin/audit-logs")]
    public async Task<IResult> DanhSachNhatKy(int page = 1, int pageSize = 50)
    {
        var loi = TroGiup.YeuCauAdmin(User);
        if (loi is not null) return loi;

        page = Math.Max(1, page);
        pageSize = Math.Clamp(pageSize, 1, 200);

        var tong = await db.NhatKyHeThong.CountAsync();
        var ds = await db.NhatKyHeThong.AsNoTracking()
            .OrderByDescending(nk => nk.NgayTao)
            .Skip((page - 1) * pageSize)
            .Take(pageSize)
            .ToListAsync();

        return Results.Ok(TroGiup.PhanTrang(ds.Select(NhatKyDto.TuNhatKy), tong, page, pageSize));
    }

    [HttpGet("/api/admin/dashboard")]
    public async Task<IResult> ThongKeTongQuan()
    {
        var loi = TroGiup.YeuCauAdmin(User);
        if (loi is not null) return loi;

        var now = DateTime.UtcNow;

        var recentUsers = await db.NguoiDung.AsNoTracking()
            .OrderByDescending(u => u.NgayTao)
            .Take(5)
            .Select(u => new { u.Id, u.Ten, u.Email, u.VaiTro, CreatedAt = u.NgayTao })
            .ToListAsync();

        var usersWithApplications = await db.NguoiDung.AsNoTracking()
            .Where(user => !string.IsNullOrWhiteSpace(user.CaiDat))
            .OrderByDescending(user => user.NgayCapNhat)
            .ToListAsync();

        var instructorApplications = usersWithApplications
            .Select(TaoHoSoGiangVienDto)
            .Where(item => item is not null)
            .Select(item => item!)
            .ToList();

        var pendingInstructorApplications = instructorApplications.Count(item => item.Status == "PENDING");
        var pendingCourses = await db.KhoaHoc.CountAsync(course => course.TrangThai == "PENDING");
        var pendingWithdrawals = await db.InstructorWithdrawals.CountAsync(item => item.TrangThai == "PENDING");
        var pendingPayments = await db.ThanhToan.CountAsync(payment => payment.TrangThai == "PENDING");
        var activeEvents = await db.SuKien.CountAsync(item =>
            (item.TrangThai == "ACTIVE" || item.TrangThai == "PUBLIC" || item.TrangThai == "PUBLISHED") &&
            item.ThoiGianKetThuc >= now);
        var activeCoupons = await db.MaGiamGia.CountAsync(item =>
            item.HoatDong &&
            item.TrangThai == "ACTIVE" &&
            (item.StartDate == null || item.StartDate <= now) &&
            (item.EndDate == null || item.EndDate >= now));
        var activeUsers = await db.NguoiDung.CountAsync(user => user.LanCuoiHoatDong != null && user.LanCuoiHoatDong >= now.AddDays(-30));

        var recentActivities = new List<AdminActivityItem>();
        recentActivities.AddRange(recentUsers.Select(user => new AdminActivityItem(
            "USER_CREATED",
            "User mới đăng ký",
            $"{(string.IsNullOrWhiteSpace(user.Ten) ? user.Email : user.Ten)} - {user.Email}",
            user.CreatedAt,
            "/admin/users")));
        recentActivities.AddRange(instructorApplications
            .Where(item => item.SubmittedAt is not null)
            .OrderByDescending(item => item.SubmittedAt)
            .Take(5)
            .Select(item => new AdminActivityItem(
                "INSTRUCTOR_APPLICATION",
                "Giảng viên gửi hồ sơ",
                $"{item.FullName} - {item.Expertise}",
                item.SubmittedAt!.Value,
                "/admin/instructor-applications")));
        recentActivities.AddRange(await db.KhoaHoc.AsNoTracking()
            .OrderByDescending(course => course.NgayTao)
            .Take(5)
            .Select(course => new AdminActivityItem(
                "COURSE_CREATED",
                "Khóa học mới tạo",
                course.TieuDe,
                course.NgayTao,
                "/admin/courses"))
            .ToListAsync());
        recentActivities.AddRange(await db.GiaoDichVi.AsNoTracking()
            .OrderByDescending(transaction => transaction.NgayTao)
            .Take(5)
            .Select(transaction => new AdminActivityItem(
                "TRANSACTION_CREATED",
                "Giao dịch mới",
                transaction.NoiDung ?? transaction.LoaiGiaoDich,
                transaction.NgayTao,
                "/admin/transactions"))
            .ToListAsync());
        recentActivities.AddRange(await db.InstructorWithdrawals.AsNoTracking()
            .OrderByDescending(item => item.NgayTao)
            .Take(5)
            .Select(item => new AdminActivityItem(
                "WITHDRAWAL_CREATED",
                "Yêu cầu rút tiền mới",
                $"{item.ChuTaiKhoan} - {item.SoTien:n0} VND",
                item.NgayTao,
                "/admin/transactions"))
            .ToListAsync());

        return Results.Ok(new
        {
            totalUsers = await db.NguoiDung.CountAsync(),
            totalCourses = await db.KhoaHoc.CountAsync(),
            totalEnrollments = await db.GhiDanh.CountAsync(),
            activeUsers,
            activeEvents,
            activeCoupons,
            pendingInstructorApplications,
            pendingCourses,
            pendingWithdrawals,
            pendingPayments,
            recentUsers,
            recentActivities = recentActivities
                .OrderByDescending(item => item.CreatedAt)
                .Take(8)
        });
    }

    [HttpGet("/api/admin/events")]
    public async Task<IResult> DanhSachSuKien(string? q = null)
    {
        var loi = TroGiup.YeuCauAdmin(User);
        if (loi is not null) return loi;

        var query = db.SuKien.AsNoTracking()
            .Include(e => e.GiangVien)
            .Include(e => e.CacDangKy)
            .AsQueryable();

        if (!string.IsNullOrWhiteSpace(q))
        {
            var tuKhoa = q.Trim();
            query = query.Where(e =>
                e.TieuDe.Contains(tuKhoa) ||
                (e.GiangVien != null && (e.GiangVien.Ten.Contains(tuKhoa) || e.GiangVien.Email.Contains(tuKhoa))));
        }

        var suKien = await query
            .OrderByDescending(e => e.ThoiGianBatDau)
            .ToListAsync();

        return Results.Ok(suKien.Select(TaoSuKienAdminDto));
    }

    [HttpGet("/api/admin/support/contacts")]
    public async Task<IResult> DanhSachLienHeHoTro(string? q = null, string? role = null)
    {
        var loi = TroGiup.YeuCauAdmin(User);
        if (loi is not null) return loi;

        var query = db.NguoiDung.AsNoTracking()
            .Where(user => user.VaiTro == "STUDENT" || user.VaiTro == "INSTRUCTOR")
            .AsQueryable();

        if (!string.IsNullOrWhiteSpace(role) && !string.Equals(role, "ALL", StringComparison.OrdinalIgnoreCase))
        {
            var vaiTro = role.Trim().ToUpperInvariant();
            query = query.Where(user => user.VaiTro == vaiTro);
        }

        if (!string.IsNullOrWhiteSpace(q))
        {
            var tuKhoa = q.Trim();
            query = query.Where(user => user.Ten.Contains(tuKhoa) || user.Email.Contains(tuKhoa));
        }

        var contacts = await query
            .OrderBy(user => user.VaiTro)
            .ThenBy(user => user.Ten)
            .ThenBy(user => user.Email)
            .Select(user => new ChatContactDto
            {
                Id = user.Id,
                Name = string.IsNullOrWhiteSpace(user.Ten) ? user.Email : user.Ten,
                Email = user.Email,
                Avatar = user.AnhDaiDien,
                Role = user.VaiTro,
                CourseId = "ADMIN_SUPPORT",
                CourseTitle = "Ho tro truc tuyen",
                ClassId = "ADMIN_SUPPORT"
            })
            .ToListAsync();

        return Results.Ok(contacts);
    }

    [HttpGet("/api/admin/withdrawals")]
    public async Task<IResult> DanhSachYeuCauRutTien()
    {
        var loi = TroGiup.YeuCauAdmin(User);
        if (loi is not null) return loi;

        var yeuCaus = await db.InstructorWithdrawals
            .Include(w => w.GiangVien)
            .OrderByDescending(w => w.NgayTao)
            .ToListAsync();

        return Results.Ok(yeuCaus.Select(w => new
        {
            w.Id,
            w.GiangVienId,
            InstructorName = w.GiangVien != null ? w.GiangVien.Ten : "Giảng viên",
            InstructorEmail = w.GiangVien != null ? w.GiangVien.Email : "",
            w.SoTien,
            w.TrangThai,
            w.TenNganHang,
            w.SoTaiKhoan,
            w.ChuTaiKhoan,
            w.NoiDung,
            CreatedAt = w.NgayTao
        }));
    }

    [HttpPost("/api/admin/withdrawals/{id}/approve")]
    public async Task<IResult> PheDuyetRutTien(string id)
    {
        var loi = TroGiup.YeuCauAdmin(User);
        if (loi is not null) return loi;

        var yeuCauRutTien = await db.InstructorWithdrawals
            .Include(w => w.GiangVien)
            .FirstOrDefaultAsync(w => w.Id == id);
        if (yeuCauRutTien is null) return Results.NotFound(new { message = "Không tìm thấy yêu cầu rút tiền" });

        if (yeuCauRutTien.TrangThai != "PENDING") return Results.BadRequest(new { message = "Yêu cầu này đã được xử lý rồi." });

        yeuCauRutTien.TrangThai = "COMPLETED";

        await GhiNhatKy("APPROVE_WITHDRAWAL", "InstructorWithdrawal", id, new { yeuCauRutTien.GiangVienId, yeuCauRutTien.SoTien });
        await db.SaveChangesAsync();

        return Results.Ok(new { message = "Đã phê duyệt yêu cầu rút tiền thành công." });
    }

    [HttpPost("/api/admin/withdrawals/{id}/reject")]
    public async Task<IResult> TuChoiRutTien(string id, [FromBody] DTOs.YeuCau.TuChoiRutTienRequest? body)
    {
        var loi = TroGiup.YeuCauAdmin(User);
        if (loi is not null) return loi;

        var yeuCauRutTien = await db.InstructorWithdrawals
            .Include(w => w.GiangVien)
            .FirstOrDefaultAsync(w => w.Id == id);
        if (yeuCauRutTien is null) return Results.NotFound(new { message = "Không tìm thấy yêu cầu rút tiền" });

        if (yeuCauRutTien.TrangThai != "PENDING") return Results.BadRequest(new { message = "Yêu cầu này đã được xử lý rồi." });

        yeuCauRutTien.TrangThai = "REJECTED";
        yeuCauRutTien.NoiDung = string.IsNullOrEmpty(body?.GhiChu) ? "Bị từ chối bởi Admin" : body.GhiChu;

        await GhiNhatKy("REJECT_WITHDRAWAL", "InstructorWithdrawal", id, new { yeuCauRutTien.GiangVienId, yeuCauRutTien.SoTien, lyDo = yeuCauRutTien.NoiDung });
        await db.SaveChangesAsync();

        return Results.Ok(new { message = "Đã từ chối yêu cầu rút tiền." });
    }

    [HttpGet("/api/admin/topup-requests")]
    public async Task<IResult> DanhSachYeuCauNapVi(string? status = null, int page = 1, int pageSize = 20)
    {
        var loi = TroGiup.YeuCauAdmin(User);
        if (loi is not null) return loi;

        page = Math.Max(1, page);
        pageSize = Math.Clamp(pageSize, 1, 100);

        var query = db.YeuCauNapVi
            .Include(y => y.NguoiDung)
            .OrderByDescending(y => y.NgayTao)
            .AsQueryable();

        if (!string.IsNullOrWhiteSpace(status))
        {
            var trangThai = status.Trim().ToLowerInvariant();
            if (trangThai == "pending") query = query.Where(y => y.TrangThai == "Pending");
            if (trangThai == "approved") query = query.Where(y => y.TrangThai == "Approved");
            if (trangThai == "rejected") query = query.Where(y => y.TrangThai == "Rejected");
        }

        var tong = await query.CountAsync();
        var ds = await query
            .Skip((page - 1) * pageSize)
            .Take(pageSize)
            .ToListAsync();

        var res = ds.Select(y => new
        {
            y.Id,
            y.NguoiDungId,
            StudentName = y.NguoiDung != null ? y.NguoiDung.Ten : "Học viên",
            StudentEmail = y.NguoiDung != null ? y.NguoiDung.Email : "",
            y.SoTien,
            y.NoiDungChuyenKhoan,
            y.TrangThai,
            y.MaGiaoDich,
            y.NgayTao,
            y.NgayDuyet,
            y.LyDoTuChoi
        });

        return Results.Ok(TroGiup.PhanTrang(res, tong, page, pageSize));
    }

    [HttpPost("/api/admin/topup-requests/{id}/approve")]
    public async Task<IResult> PheDuyetYeuCauNapVi(string id)
    {
        var loi = TroGiup.YeuCauAdmin(User);
        if (loi is not null) return loi;

        var strategy = db.Database.CreateExecutionStrategy();
        return await strategy.ExecuteAsync(async () =>
        {
            await using var transaction = await db.Database.BeginTransactionAsync(IsolationLevel.Serializable);
            try
            {
                var yeuCau = await db.YeuCauNapVi
                    .Include(y => y.NguoiDung)
                    .FirstOrDefaultAsync(y => y.Id == id);

                if (yeuCau is null) return Results.NotFound(new { message = "Không tìm thấy yêu cầu nạp ví" });

                if (yeuCau.TrangThai != "Pending")
                    return Results.BadRequest(new { message = "Yêu cầu này đã được xử lý rồi." });

                var user = yeuCau.NguoiDung;
                if (user is null) return Results.NotFound(new { message = "Không tìm thấy người dùng của yêu cầu này" });

                yeuCau.TrangThai = "Approved";
                yeuCau.NgayDuyet = DateTime.UtcNow;

                user.SoDuVi += yeuCau.SoTien;
                TroGiup.DongBoHangThanhVien(user);
                user.NgayCapNhat = DateTime.UtcNow;

                var now = DateTime.UtcNow;
                var thanhToanNgoai = new ThanhToan
                {
                    Id = TaoId.Moi(),
                    NguoiDungId = user.Id,
                    SoTien = yeuCau.SoTien,
                    NhaCungCap = "MANUAL",
                    PhienNhaCungCapId = yeuCau.MaGiaoDich,
                    TrangThai = "COMPLETED",
                    NoiDung = $"Nạp ví chuyển khoản {TroGiup.DinhDangTienVND(yeuCau.SoTien)}",
                    NgayHoanThanh = now,
                    NgayTao = now,
                    NgayCapNhat = now
                };
                db.ThanhToan.Add(thanhToanNgoai);

                db.GiaoDichVi.Add(new GiaoDichVi
                {
                    Id = TaoId.Moi(),
                    NguoiDungId = user.Id,
                    LoaiGiaoDich = "TOP_UP",
                    SoTien = yeuCau.SoTien,
                    SoDuSauGiaoDich = user.SoDuVi,
                    NoiDung = $"Nạp ví chuyển khoản {TroGiup.DinhDangTienVND(yeuCau.SoTien)} (Admin duyệt)",
                    ThanhToanId = thanhToanNgoai.Id,
                    NgayTao = now
                });

                db.ThongBao.Add(new ThongBao
                {
                    Id = TaoId.Moi(),
                    NguoiDungId = user.Id,
                    LoaiThongBao = "PAYMENT_SUCCESS",
                    TieuDe = "Nạp ví thành công",
                    NoiDung = $"Yêu cầu nạp {TroGiup.DinhDangTienVND(yeuCau.SoTien)} đã được duyệt thành công.",
                    DuongDan = "/pricing",
                    Metadata = System.Text.Json.JsonSerializer.Serialize(new { amount = yeuCau.SoTien, externalPaymentId = thanhToanNgoai.Id }),
                    NgayTao = now
                });

                await GhiNhatKy("APPROVE_TOP_UP", "YeuCauNapVi", id, new { yeuCau.NguoiDungId, yeuCau.SoTien });
                await db.SaveChangesAsync();
                await transaction.CommitAsync();

                return Results.Ok(new { message = "Đã duyệt yêu cầu nạp tiền thành công." });
            }
            catch (Exception ex)
            {
                await transaction.RollbackAsync();
                return Results.Json(new { message = "Lỗi hệ thống khi duyệt nạp ví.", detail = ex.Message }, statusCode: 500);
            }
        });
    }

    [HttpPost("/api/admin/topup-requests/{id}/reject")]
    public async Task<IResult> TuChoiYeuCauNapVi(string id, [FromBody] DTOs.YeuCau.TuChoiRequest? body)
    {
        var loi = TroGiup.YeuCauAdmin(User);
        if (loi is not null) return loi;

        var yeuCau = await db.YeuCauNapVi.FirstOrDefaultAsync(y => y.Id == id);
        if (yeuCau is null) return Results.NotFound(new { message = "Không tìm thấy yêu cầu nạp ví" });

        if (yeuCau.TrangThai != "Pending")
            return Results.BadRequest(new { message = "Yêu cầu này đã được xử lý rồi." });

        yeuCau.TrangThai = "Rejected";
        yeuCau.NgayDuyet = DateTime.UtcNow;
        yeuCau.LyDoTuChoi = string.IsNullOrWhiteSpace(body?.GhiChu) ? "Bị từ chối bởi Admin" : body.GhiChu.Trim();

        db.ThongBao.Add(new ThongBao
        {
            Id = TaoId.Moi(),
            NguoiDungId = yeuCau.NguoiDungId,
            LoaiThongBao = "PAYMENT_FAILED",
            TieuDe = "Yêu cầu nạp ví bị từ chối",
            NoiDung = $"Yêu cầu nạp {TroGiup.DinhDangTienVND(yeuCau.SoTien)} đã bị từ chối. Lý do: {yeuCau.LyDoTuChoi}",
            DuongDan = "/pricing",
            NgayTao = DateTime.UtcNow
        });

        await GhiNhatKy("REJECT_TOP_UP", "YeuCauNapVi", id, new { yeuCau.NguoiDungId, yeuCau.SoTien, lyDo = yeuCau.LyDoTuChoi });
        await db.SaveChangesAsync();

        return Results.Ok(new { message = "Đã từ chối yêu cầu nạp ví." });
    }

    private static JsonObject DocCaiDat(NguoiDung user)
    {
        if (string.IsNullOrWhiteSpace(user.CaiDat)) return new JsonObject();

        try
        {
            return JsonNode.Parse(user.CaiDat)?.AsObject() ?? new JsonObject();
        }
        catch (JsonException)
        {
            return new JsonObject();
        }
    }

    private static HoSoGiangVienAdminDto? TaoHoSoGiangVienDto(NguoiDung user)
    {
        var settings = DocCaiDat(user);
        if (settings["instructorApplication"] is not JsonObject application) return null;

        var status = LayChuoi(application, "status")?.ToUpperInvariant() ?? "PENDING";
        var submittedAt = LayNgay(application, "submittedAt");

        return new HoSoGiangVienAdminDto(
            user.Id,
            string.IsNullOrWhiteSpace(user.Ten) ? user.Email : user.Ten,
            user.Email,
            user.SoDienThoai,
            LayChuoi(application, "fieldName") ?? LayChuoi(application, "field") ?? "Chua cap nhat",
            LayChuoi(application, "bio") ?? user.TieuSu,
            LayChuoi(application, "cvName"),
            LayChuoi(application, "motivation"),
            LayChuoi(application, "linkedinUrl"),
            LayChuoi(application, "portfolioUrl"),
            status,
            LayChuoi(application, "rejectReason"),
            submittedAt,
            LayNgay(application, "approvedAt"),
            LayNgay(application, "rejectedAt"));
    }

    private static string? LayChuoi(JsonObject node, string propertyName)
    {
        return node.TryGetPropertyValue(propertyName, out var value) && value is not null
            ? value.GetValue<string?>()
            : null;
    }

    private static DateTime? LayNgay(JsonObject node, string propertyName)
    {
        var value = LayChuoi(node, propertyName);
        return DateTime.TryParse(value, out var parsed) ? parsed : null;
    }

    private static object TaoSuKienAdminDto(SuKien item)
    {
        var registrations = item.CacDangKy.Count(entry => entry.TrangThai == "REGISTERED");

        return new
        {
            id = item.Id,
            title = item.TieuDe,
            description = item.MoTa,
            type = item.LoaiSuKien,
            format = item.Format,
            startsAt = item.ThoiGianBatDau,
            startAt = item.ThoiGianBatDau,
            endsAt = item.ThoiGianKetThuc,
            endAt = item.ThoiGianKetThuc,
            instructorId = item.GiangVienId,
            instructorName = item.GiangVien?.Ten ?? "Giang vien",
            instructorEmail = item.GiangVien?.Email,
            registrationCount = registrations,
            capacity = item.SucChua,
            status = item.TrangThai,
            location = item.DiaDiem,
            createdAt = item.NgayTao,
            updatedAt = item.NgayCapNhat
        };
    }

    private sealed record AdminActivityItem(
        string Type,
        string Title,
        string Description,
        DateTime CreatedAt,
        string Link);

    private sealed record HoSoGiangVienAdminDto(
        string Id,
        string FullName,
        string Email,
        string? Phone,
        string Expertise,
        string? Experience,
        string? CertificateFilePath,
        string? Motivation,
        string? LinkedinUrl,
        string? PortfolioUrl,
        string Status,
        string? RejectReason,
        DateTime? SubmittedAt,
        DateTime? ApprovedAt,
        DateTime? RejectedAt);

    private async Task XoaDuLieuKhoaHoc(string courseId)
    {
        var lessonIds = await db.BaiHoc.Where(l => l.KhoaHocId == courseId).Select(l => l.Id).ToListAsync();
        var quizIds = await db.BaiKiemTra.Where(q => lessonIds.Contains(q.BaiHocId)).Select(q => q.Id).ToListAsync();

        db.BaiNopKiemTra.RemoveRange(await db.BaiNopKiemTra.Where(s => quizIds.Contains(s.BaiKiemTraId)).ToListAsync());
        db.CauHoiKiemTra.RemoveRange(await db.CauHoiKiemTra.Where(q => quizIds.Contains(q.BaiKiemTraId)).ToListAsync());
        db.BaiKiemTra.RemoveRange(await db.BaiKiemTra.Where(q => quizIds.Contains(q.Id)).ToListAsync());
        db.BinhLuan.RemoveRange(await db.BinhLuan.Where(c => lessonIds.Contains(c.BaiHocId)).ToListAsync());
        db.TienDoBaiHoc.RemoveRange(await db.TienDoBaiHoc.Where(p => lessonIds.Contains(p.BaiHocId)).ToListAsync());
        db.BaiTap.RemoveRange(await db.BaiTap.Where(a => a.KhoaHocId == courseId || (a.BaiHocId != null && lessonIds.Contains(a.BaiHocId))).ToListAsync());
        db.MaGiamGia.RemoveRange(await db.MaGiamGia.Where(c => c.KhoaHocId == courseId).ToListAsync());
        db.DanhGiaKhoaHoc.RemoveRange(await db.DanhGiaKhoaHoc.Where(r => r.KhoaHocId == courseId).ToListAsync());
        db.ChungChi.RemoveRange(await db.ChungChi.Where(c => c.KhoaHocId == courseId).ToListAsync());
        db.GhiDanh.RemoveRange(await db.GhiDanh.Where(e => e.KhoaHocId == courseId).ToListAsync());
        db.GiaoDichVi.RemoveRange(await db.GiaoDichVi.Where(t => t.KhoaHocId == courseId).ToListAsync());
        db.DonMua.RemoveRange(await db.DonMua.Where(p => p.KhoaHocId == courseId).ToListAsync());
        db.BaiHoc.RemoveRange(await db.BaiHoc.Where(l => l.KhoaHocId == courseId).ToListAsync());
        db.ChuongHoc.RemoveRange(await db.ChuongHoc.Where(s => s.KhoaHocId == courseId).ToListAsync());
        db.KhoaHoc.RemoveRange(await db.KhoaHoc.Where(c => c.Id == courseId).ToListAsync());
    }

    private async Task GhiNhatKy(string action, string entityType, string? entityId, object? metadata = null)
    {
        db.NhatKyHeThong.Add(new NhatKyHeThong
        {
            Id = TaoId.Moi(),
            NguoiThucHienId = User.FindFirstValue(ClaimTypes.NameIdentifier),
            EmailNguoiThucHien = User.FindFirstValue(ClaimTypes.Email),
            HanhDong = action,
            LoaiThucTe = entityType,
            ThucTheId = entityId,
            Metadata = metadata is null ? null : JsonSerializer.Serialize(metadata),
            IpAddress = HttpContext.Connection.RemoteIpAddress?.ToString(),
            UserAgent = Request.Headers.UserAgent.ToString(),
            NgayTao = DateTime.UtcNow
        });

        await Task.CompletedTask;
    }
}

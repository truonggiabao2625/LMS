using System.Text.Json;

namespace LMS.Api.DTOs.YeuCau;

/// <summary>Yêu cầu đăng ký tài khoản mới</summary>
public record DangKyRequest(string Email, string Password, string? Name);

/// <summary>Yêu cầu đăng nhập</summary>
public record DangNhapRequest(string Email, string Password);

/// <summary>Yêu cầu cập nhật thông tin người dùng</summary>
public record CapNhatNguoiDungRequest(string? Name, string? Phone, string? Bio, JsonElement? Settings);
public record CapNhatHoSoTaiKhoanRequest(string? Name, string? Email, string? Phone, string? Bio, JsonElement? Settings);
public record DoiMatKhauTaiKhoanRequest(string CurrentPassword, string NewPassword, string ConfirmPassword);
public record CapNhatCaiDatRequest(JsonElement Settings);

/// <summary>Yêu cầu đổi mật khẩu người dùng</summary>
public record DoiMatKhauRequest(string CurrentPassword, string NewPassword);

/// <summary>Yêu cầu thay đổi vai trò người dùng (admin)</summary>
public record DoiVaiTroRequest(string Role);

/// <summary>Yêu cầu thanh toán (nạp ví hoặc mua khóa)</summary>
public record ThanhToanRequest(string Type, string? CourseId, int? Amount, string? CouponCode);
public record MuaKhoaHocRequest(string? CouponCode);
public record RutTienDemoRequest(int SoTien, string? GhiChu);
public record RutTienGiangVienRequest(int SoTien, string? BankName, string? AccountHolder, string? AccountNumber, string? Branch, string? GhiChu);
public record TuChoiRutTienRequest(string? GhiChu);
public record CapNhatKhoaTaiKhoanRequest(bool Locked, string? Reason);
public record CapNhatQuyenDayRequest(bool TeachingDisabled, string? Reason);
public record TuChoiRequest(string? GhiChu);

/// <summary>Yêu cầu kiểm tra mã giảm giá</summary>
public record KiemTraMaGiamGiaRequest(string? Code, string? CourseId);

/// <summary>Yêu cầu tạo mã giảm giá mới</summary>
public record TaoMaGiamGiaRequest(
    string? Code,
    string? DiscountType,
    int DiscountValue,
    int? MinPurchaseAmount,
    int? MaxDiscountAmount,
    DateTime? StartDate,
    DateTime? EndDate,
    int? UsageLimit,
    string? CourseId);

public record GuiMaGiamGiaRequest(List<string>? StudentIds, string? SourceCourseId);

/// <summary>Yêu cầu tạo/cập nhật khóa học</summary>
public record LuuKhoaHocRequest(string? Title, string? Description, string? Thumbnail, int? Price, string? MinimumMemberTier);

/// <summary>Yêu cầu thay đổi trạng thái xuất bản</summary>
public record XuatBanRequest(bool IsPublished, DateTime? StartDate = null, DateTime? EndDate = null);

/// <summary>Yêu cầu tạo/cập nhật chương</summary>
public record LuuChuongRequest(string? Title, string? Description);

/// <summary>Yêu cầu tạo/cập nhật bài giảng</summary>
public record LuuBaiGiangRequest(string? Title, string? Content, string? VideoUrl, int? DurationSeconds, bool? IsPublished, bool? IsPreview, string? SectionId);

/// <summary>Yêu cầu sắp xếp lại chương trình</summary>
public record SapXepLaiRequest(List<SapXepChuongRequest>? Sections);
public record SapXepChuongRequest(string Id, List<SapXepBaiRequest>? Lessons);
public record SapXepBaiRequest(string Id);

/// <summary>Yêu cầu đánh giá khóa học</summary>
public record DanhGiaRequest(int Rating, string? Comment);

/// <summary>Yêu cầu gửi bình luận</summary>
public record BinhLuanRequest(string Content, string? ParentId);

/// <summary>Yêu cầu cập nhật tiến độ bài học</summary>
public record TienDoRequest(int? WatchedSeconds, int? LastPositionSeconds, int? DurationSeconds, bool? MarkCompleted);

/// <summary>Yêu cầu nộp bài kiểm tra</summary>
public record NopBaiRequest(Dictionary<string, int>? Answers);

/// <summary>Yêu cầu tạo/cập nhật bài kiểm tra</summary>
public record LuuBaiKiemTraRequest(string? Title, string? Description, int? PassingScore, List<CauHoiRequest>? Questions);

/// <summary>Một câu hỏi trong bài kiểm tra</summary>
public record CauHoiRequest(string? QuestionText, List<string>? Options, int CorrectOptionIndex, string? Explanation);

/// <summary>Yêu cầu tạo/cập nhật danh mục</summary>
public record TaoDanhMucRequest(string Ten, string? MoTa);

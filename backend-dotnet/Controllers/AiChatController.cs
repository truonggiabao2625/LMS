using LMS.Api.Infrastructure.Persistence;
using LMS.Api.Domain.Entities;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using System.Text.RegularExpressions;
using System.Text.Json;
using System.Text;

namespace LMS.Api.Controllers;

[ApiController]
[Route("api/[controller]")]
public class AiChatController(ApplicationDbContext db, IConfiguration configuration) : ControllerBase
{
    private static readonly HttpClient _httpClient = new();

    public class ConsultRequest
    {
        public string Message { get; set; } = string.Empty;
    }

    [HttpPost("consult")]
    public async Task<IActionResult> Consult([FromBody] ConsultRequest request)
    {
        if (string.IsNullOrWhiteSpace(request.Message))
        {
            return BadRequest(new { message = "Nội dung tin nhắn không được để trống." });
        }

        // Fetch all published courses
        var allCourses = await db.KhoaHoc
            .AsNoTracking()
            .Where(k => k.DaXuatBan)
            .Include(k => k.GiangVien)
            .Select(k => new
            {
                id = k.Id,
                title = k.TieuDe,
                moTaNgan = k.MoTaNgan,
                category = k.ChuyenMuc,
                price = k.Gia,
                rating = k.DiemDanhGiaTrungBinh,
                thumbnail = k.AnhDaiDien,
                instructorName = k.GiangVien != null ? k.GiangVien.Ten : "Giảng viên",
                studentCount = k.CacGhiDanh.Count
            })
            .ToListAsync();

        var apiKey = configuration["Gemini:ApiKey"];
        if (string.IsNullOrWhiteSpace(apiKey) || apiKey == "YOUR_GEMINI_API_KEY_HERE")
        {
            apiKey = configuration["GEMINI_API_KEY"];
        }

        if (!string.IsNullOrWhiteSpace(apiKey) && apiKey != "YOUR_GEMINI_API_KEY_HERE")
        {
            try
            {
                // Serialize list of courses for Gemini context
                var coursesJsonContext = JsonSerializer.Serialize(allCourses.Select(c => new {
                    c.id,
                    c.title,
                    c.moTaNgan,
                    c.category,
                    c.price,
                    c.rating,
                    c.instructorName
                }));

                // Build prompt
                var systemInstruction = "Bạn là trợ lý tư vấn khóa học thông minh của Skillio LMS. " +
                                        "Dưới đây là danh sách khóa học thực tế có trong hệ thống: " + coursesJsonContext + "\n" +
                                        "Khi học viên đặt câu hỏi, hãy tư vấn thân thiện bằng tiếng Việt, giải thích vì sao khóa học đó phù hợp với họ. " +
                                        "Chỉ gợi ý các khóa học có trong danh sách trên. " +
                                        "Bắt buộc phải trả về dữ liệu đúng định dạng JSON sau:\n" +
                                        "{\n" +
                                        "  \"reply\": \"nội dung câu trả lời tư vấn bằng tiếng Việt\",\n" +
                                        "  \"courseIds\": [\"id_khoa_hoc_1\", \"id_khoa_hoc_2\"]\n" +
                                        "}";

                var requestBody = new
                {
                    contents = new[]
                    {
                        new {
                            parts = new[] {
                                new { text = systemInstruction },
                                new { text = "Câu hỏi học viên: " + request.Message }
                            }
                        }
                    },
                    generationConfig = new
                    {
                        responseMimeType = "application/json"
                    }
                };

                var requestJson = JsonSerializer.Serialize(requestBody);
                var content = new StringContent(requestJson, Encoding.UTF8, "application/json");

                var url = $"https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key={apiKey}";
                var response = await _httpClient.PostAsync(url, content);

                if (response.IsSuccessStatusCode)
                {
                    var responseString = await response.Content.ReadAsStringAsync();
                    using var doc = JsonDocument.Parse(responseString);
                    var candidates = doc.RootElement.GetProperty("candidates");
                    var firstCandidate = candidates[0];
                    var contentObj = firstCandidate.GetProperty("content");
                    var parts = contentObj.GetProperty("parts");
                    var rawText = parts[0].GetProperty("text").GetString();

                    if (!string.IsNullOrWhiteSpace(rawText))
                    {
                        using var geminiResult = JsonDocument.Parse(rawText);
                        var replyText = geminiResult.RootElement.GetProperty("reply").GetString() ?? "";
                        var courseIdsJson = geminiResult.RootElement.GetProperty("courseIds");
                        
                        var matchedIds = new List<string>();
                        foreach (var item in courseIdsJson.EnumerateArray())
                        {
                            var id = item.GetString();
                            if (id != null) matchedIds.Add(id);
                        }

                        // Map matched course IDs back to full course details
                        var recommended = allCourses
                            .Where(c => matchedIds.Contains(c.id))
                            .Select(c => (object)new
                            {
                                id = c.id,
                                title = c.title,
                                price = c.price,
                                instructorName = c.instructorName,
                                rating = c.rating,
                                thumbnail = c.thumbnail,
                                category = c.category
                            })
                            .ToList();

                        return Ok(new
                        {
                            reply = replyText,
                            courses = recommended
                        });
                    }
                }
            }
            catch (Exception ex)
            {
                // Log exception in development console (silently fallback)
                Console.WriteLine($"Gemini API error, falling back to smart local matching: {ex.Message}");
            }
        }

        // --- FALLBACK TO SMART LOCAL KEYWORD MATCH ---
        var messageLower = request.Message.ToLower();
        var recommendedList = new List<object>();
        string reply = "";

        bool isDev = Regex.IsMatch(messageLower, @"(lập trình|web|react|c#|csharp|dotnet|code|dev|javascript|js|front|back|html|css|github|git)");
        bool isDesign = Regex.IsMatch(messageLower, @"(thiết kế|design|figma|photoshop|graphics|ux|ui|illustrator|vẽ|art)");
        bool isData = Regex.IsMatch(messageLower, @"(dữ liệu|data|python|sql|excel|analysis|machine|ai|ml|big data|analytics)");
        bool isMarketing = Regex.IsMatch(messageLower, @"(marketing|ads|seo|facebook|tiktok|content|kinh doanh|bán hàng)");
        bool isLanguage = Regex.IsMatch(messageLower, @"(tiếng|ngoại ngữ|anh|ielts|toeic|japanese|english|nhật|trung|hàn|korean|chinese)");
        bool isSoftSkills = Regex.IsMatch(messageLower, @"(kỹ năng|mềm|giao tiếp|thuyết trình|quản lý|thời gian|negotiation)");
        bool isFree = Regex.IsMatch(messageLower, @"(miễn phí|free|0đ|0 đồng|không đồng)");
        bool isPopular = Regex.IsMatch(messageLower, @"(bán chạy|hot|nhiều học viên|phổ biến|yêu thích|tốt nhất|nổi bật)");

        var matchedCourses = allCourses.AsEnumerable();

        if (isFree)
        {
            matchedCourses = matchedCourses.Where(c => c.price == 0);
        }

        if (isDev)
        {
            matchedCourses = matchedCourses.Where(c => c.category.Contains("Lập trình", StringComparison.OrdinalIgnoreCase) || 
                                                       c.title.Contains("Web", StringComparison.OrdinalIgnoreCase) ||
                                                       c.title.Contains("React", StringComparison.OrdinalIgnoreCase) ||
                                                       c.title.Contains("Code", StringComparison.OrdinalIgnoreCase));
            reply = "Dựa trên nhu cầu học Lập trình của bạn, đây là các khóa học chuyên sâu từ cơ bản đến nâng cao phù hợp nhất:";
        }
        else if (isDesign)
        {
            matchedCourses = matchedCourses.Where(c => c.category.Contains("Thiết kế", StringComparison.OrdinalIgnoreCase) ||
                                                       c.title.Contains("Design", StringComparison.OrdinalIgnoreCase) ||
                                                       c.title.Contains("Figma", StringComparison.OrdinalIgnoreCase));
            reply = "Nếu bạn đam mê Thiết kế UI/UX hay Đồ họa, các khóa học đầy cảm hứng này sẽ giúp bạn làm chủ công cụ và tư duy thẩm mỹ:";
        }
        else if (isData)
        {
            matchedCourses = matchedCourses.Where(c => c.category.Contains("Dữ liệu", StringComparison.OrdinalIgnoreCase) ||
                                                       c.title.Contains("Python", StringComparison.OrdinalIgnoreCase) ||
                                                       c.title.Contains("SQL", StringComparison.OrdinalIgnoreCase) ||
                                                       c.title.Contains("Data", StringComparison.OrdinalIgnoreCase));
            reply = "Chào bạn! Đây là các khóa học về Khoa học Dữ liệu, Phân tích & AI giúp bạn làm chủ thông tin và phát triển sự nghiệp:";
        }
        else if (isMarketing)
        {
            matchedCourses = matchedCourses.Where(c => c.category.Contains("Marketing", StringComparison.OrdinalIgnoreCase) ||
                                                       c.title.Contains("SEO", StringComparison.OrdinalIgnoreCase) ||
                                                       c.title.Contains("Ads", StringComparison.OrdinalIgnoreCase));
            reply = "Để giúp bạn tối ưu chiến dịch và tăng trưởng doanh số, đây là các khóa học Marketing thực chiến nổi bật:";
        }
        else if (isLanguage)
        {
            matchedCourses = matchedCourses.Where(c => c.category.Contains("Ngoại ngữ", StringComparison.OrdinalIgnoreCase) ||
                                                       c.title.Contains("IELTS", StringComparison.OrdinalIgnoreCase) ||
                                                       c.title.Contains("Tiếng", StringComparison.OrdinalIgnoreCase));
            reply = "Lộ trình cải thiện Ngoại ngữ và chinh phục các chứng chỉ quốc tế chất lượng nhất dành cho bạn:";
        }
        else if (isSoftSkills)
        {
            matchedCourses = matchedCourses.Where(c => c.category.Contains("Kỹ năng", StringComparison.OrdinalIgnoreCase) ||
                                                       c.title.Contains("Giao tiếp", StringComparison.OrdinalIgnoreCase) ||
                                                       c.title.Contains("Quản lý", StringComparison.OrdinalIgnoreCase));
            reply = "Phát triển kỹ năng mềm là chìa khóa thăng tiến nhanh nhất. Dưới đây là các khóa học rèn luyện tư duy thực tế:";
        }

        if (isPopular)
        {
            matchedCourses = matchedCourses.OrderByDescending(c => c.studentCount).ThenByDescending(c => c.rating);
            if (string.IsNullOrEmpty(reply))
            {
                reply = "Chào bạn! Dưới đây là danh sách các khóa học được học viên đăng ký nhiều nhất và đánh giá cực cao trên Skillio:";
            }
        }
        else
        {
            matchedCourses = matchedCourses.OrderByDescending(c => c.rating);
        }

        var resultList = matchedCourses.Take(3).ToList();

        if (resultList.Count == 0)
        {
            resultList = allCourses.OrderByDescending(c => c.rating).Take(3).ToList();
            if (isFree)
            {
                reply = "Rất tiếc hiện tại hệ thống chưa có khóa học miễn phí phù hợp với từ khóa này. Bạn có thể tham khảo các khóa học hàng đầu sau:";
            }
            else
            {
                reply = "Chào bạn! Mình là Trợ lý AI của Skillio. Mình có thể hỗ trợ bạn tìm kiếm khóa học phù hợp. Dưới đây là một số khóa học nổi bật nhất hệ thống hiện tại:";
            }
        }

        foreach (var c in resultList)
        {
            recommendedList.Add(new
            {
                id = c.id,
                title = c.title,
                price = c.price,
                instructorName = c.instructorName,
                rating = c.rating,
                thumbnail = c.thumbnail,
                category = c.category
            });
        }

        return Ok(new
        {
            reply = reply,
            courses = recommendedList
        });
    }
}

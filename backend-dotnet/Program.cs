using System.Text;
using LMS.Api.Infrastructure.Persistence;
using LMS.Api.Application.Services;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.Authentication.Cookies;
using Microsoft.EntityFrameworkCore;
using Microsoft.IdentityModel.Tokens;
using System.Text.Json.Serialization;
using System.Diagnostics;

var builder = WebApplication.CreateBuilder(args);

builder.Logging.ClearProviders();
builder.Logging.AddConsole();

var connectionString =
    builder.Configuration.GetConnectionString("DefaultConnection")
    ?? builder.Configuration["DATABASE_URL"]
    ?? "Server=127.0.0.1,11433;Database=lms;User Id=sa;Password=LmsPassw0rd#2026;TrustServerCertificate=True;Encrypt=False";

var rawFrontendUrl = builder.Configuration["FRONTEND_URL"] ?? "http://localhost:5173";
var frontendUrl = rawFrontendUrl.Trim().TrimEnd('/');
if (!frontendUrl.StartsWith("http://", StringComparison.OrdinalIgnoreCase) && 
    !frontendUrl.StartsWith("https://", StringComparison.OrdinalIgnoreCase))
{
    frontendUrl = "https://" + frontendUrl;
}
Console.WriteLine($"[CORS POLICY] Configured frontendUrl: '{frontendUrl}' (Raw: '{rawFrontendUrl}')");
var jwtSecret = builder.Configuration["JWT_SECRET"] ?? "change-me-to-a-long-random-secret";
var jwtKey = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(jwtSecret));
static string? FirstConfigured(params string?[] values) =>
    values.FirstOrDefault(value => !string.IsNullOrWhiteSpace(value));

static async Task EnsureLocalDbStartedAsync(string connectionString, ILogger logger)
{
    if (!connectionString.Contains("(localdb)", StringComparison.OrdinalIgnoreCase))
    {
        return;
    }

    var instanceName = "MSSQLLocalDB";
    var serverPart = connectionString
        .Split(';', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries)
        .FirstOrDefault(part =>
            part.StartsWith("Server=", StringComparison.OrdinalIgnoreCase) ||
            part.StartsWith("Data Source=", StringComparison.OrdinalIgnoreCase));

    if (!string.IsNullOrWhiteSpace(serverPart))
    {
        var serverValue = serverPart[(serverPart.IndexOf('=') + 1)..].Trim();
        var marker = @"(localdb)\";
        var markerIndex = serverValue.IndexOf(marker, StringComparison.OrdinalIgnoreCase);
        if (markerIndex >= 0)
        {
            instanceName = serverValue[(markerIndex + marker.Length)..].Trim();
        }
    }

    static async Task<(int ExitCode, string Output, string Error)> RunLocalDbAsync(params string[] arguments)
    {
        using var process = new Process();
        process.StartInfo = new ProcessStartInfo
        {
            FileName = "sqllocaldb",
            UseShellExecute = false,
            RedirectStandardOutput = true,
            RedirectStandardError = true,
            CreateNoWindow = true
        };

        foreach (var argument in arguments)
        {
            process.StartInfo.ArgumentList.Add(argument);
        }

        process.Start();
        var outputTask = process.StandardOutput.ReadToEndAsync();
        var errorTask = process.StandardError.ReadToEndAsync();
        await process.WaitForExitAsync();
        return (process.ExitCode, await outputTask, await errorTask);
    }

    try
    {
        var info = await RunLocalDbAsync("info", instanceName);
        if (info.ExitCode == 0 && info.Output.Contains("State:              Running", StringComparison.OrdinalIgnoreCase))
        {
            return;
        }

        logger.LogInformation("Starting SQL Server LocalDB instance {InstanceName} before applying migrations.", instanceName);
        var start = await RunLocalDbAsync("start", instanceName);
        if (start.ExitCode == 0)
        {
            return;
        }

        logger.LogWarning(
            "Could not start SQL Server LocalDB instance {InstanceName}. sqllocaldb output: {Output} {Error}",
            instanceName,
            start.Output.Trim(),
            start.Error.Trim());
    }
    catch (Exception ex)
    {
        logger.LogWarning(ex, "Could not run sqllocaldb preflight for LocalDB instance {InstanceName}.", instanceName);
    }
}

builder.Services.AddDbContext<ApplicationDbContext>(options =>
    options.UseSqlServer(connectionString, sqlOptions =>
    {
        sqlOptions.EnableRetryOnFailure();
        sqlOptions.UseQuerySplittingBehavior(QuerySplittingBehavior.SplitQuery);
    }));
builder.Services.AddScoped<IDichVuXacThuc, DichVuXacThuc>();
builder.Services.AddScoped<IDichVuNguoiDung, DichVuNguoiDung>();
builder.Services.AddScoped<IDichVuKhoaHoc, DichVuKhoaHoc>();
builder.Services.AddScoped<IDichVuGhiDanh, DichVuGhiDanh>();
builder.Services.AddScoped<IDichVuThanhToan, DichVuThanhToan>();
builder.Services.AddScoped<IDichVuBaiKiemTra, DichVuBaiKiemTra>();
builder.Services.AddScoped<IDichVuChat, DichVuChat>();

builder.Services.AddControllers()
    .AddJsonOptions(options =>
    {
        options.JsonSerializerOptions.ReferenceHandler = ReferenceHandler.IgnoreCycles;
        options.JsonSerializerOptions.WriteIndented = true;
    });
builder.Services.AddControllersWithViews();
builder.Services.AddOpenApi();
builder.Services.AddSignalR();

var authentication = builder.Services
    .AddAuthentication(options =>
    {
        options.DefaultAuthenticateScheme = JwtBearerDefaults.AuthenticationScheme;
        options.DefaultChallengeScheme = JwtBearerDefaults.AuthenticationScheme;
    })
    .AddJwtBearer(options =>
    {
        options.Events = new JwtBearerEvents
        {
            OnMessageReceived = context =>
            {
                var accessToken = context.Request.Query["access_token"];
                var path = context.HttpContext.Request.Path;

                if (!string.IsNullOrEmpty(accessToken) && path.StartsWithSegments("/chatHub"))
                {
                    context.Token = accessToken;
                }
                else if (string.IsNullOrWhiteSpace(context.Token) &&
                    context.Request.Cookies.TryGetValue("LmsAuthToken", out var cookieToken))
                {
                    context.Token = cookieToken;
                }

                return Task.CompletedTask;
            }
        };
        options.TokenValidationParameters = new TokenValidationParameters
        {
            ValidateIssuer = false,
            ValidateAudience = false,
            ValidateIssuerSigningKey = true,
            IssuerSigningKey = jwtKey,
            ClockSkew = TimeSpan.FromMinutes(1)
        };
    })
    .AddCookie("External", options =>
    {
        options.Cookie.Name = "LmsExternalAuth";
        options.ExpireTimeSpan = TimeSpan.FromMinutes(10);
    });

// Google authentication configuration
var googleClientId = FirstConfigured(builder.Configuration["Authentication:Google:ClientId"], builder.Configuration["GOOGLE_CLIENT_ID"]);
var googleClientSecret = FirstConfigured(builder.Configuration["Authentication:Google:ClientSecret"], builder.Configuration["GOOGLE_CLIENT_SECRET"]);
if (!string.IsNullOrWhiteSpace(googleClientId) && !string.IsNullOrWhiteSpace(googleClientSecret))
{
    authentication.AddGoogle("Google", options =>
    {
        options.ClientId = googleClientId;
        options.ClientSecret = googleClientSecret;
        options.SignInScheme = "External";
        options.Events.OnRemoteFailure = context =>
        {
            context.HandleResponse();

            var message = "Không thể đăng nhập bằng Google. Vui lòng kiểm tra lại Google Client ID và Client Secret.";
            if (context.Failure?.Message.Contains("invalid_client", StringComparison.OrdinalIgnoreCase) == true ||
                context.Failure?.Message.Contains("client secret", StringComparison.OrdinalIgnoreCase) == true)
            {
                message = "Google Client Secret không đúng với Client ID hiện tại. Vui lòng cập nhật lại Client Secret trong cấu hình.";
            }

            context.Response.Redirect($"{frontendUrl}/oauth-callback?error={Uri.EscapeDataString(message)}");
            return Task.CompletedTask;
        };
    });
}

builder.Services.Configure<Microsoft.AspNetCore.Builder.ForwardedHeadersOptions>(options =>
{
    options.ForwardedHeaders = Microsoft.AspNetCore.HttpOverrides.ForwardedHeaders.XForwardedFor | Microsoft.AspNetCore.HttpOverrides.ForwardedHeaders.XForwardedProto;
    options.KnownIPNetworks.Clear();
    options.KnownProxies.Clear();
});

builder.Services.AddAuthorization();
builder.Services.AddCors(options =>
{
    options.AddPolicy("Frontend", policy =>
    {
        policy
            .WithOrigins(
                frontendUrl,
                "http://localhost:5173",
                "http://localhost:5174",
                "http://127.0.0.1:5173",
                "http://127.0.0.1:5174")
            .AllowAnyHeader()
            .AllowAnyMethod()
            .AllowCredentials();
    });
});

var app = builder.Build();

app.UseForwardedHeaders();

await using (var scope = app.Services.CreateAsyncScope())
{
    var logger = scope.ServiceProvider.GetRequiredService<ILoggerFactory>().CreateLogger("LocalDbStartup");
    await EnsureLocalDbStartedAsync(connectionString, logger);

    var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
    await db.Database.MigrateAsync();

    // Ensure KhoaHocAnh table is created if the migration was already marked as applied but the table is missing
    await db.Database.ExecuteSqlRawAsync(@"
        IF OBJECT_ID(N'[KhoaHocAnh]') IS NULL
        BEGIN
            CREATE TABLE [KhoaHocAnh] (
                [Id] nvarchar(450) NOT NULL,
                [KhoaHocId] nvarchar(450) NOT NULL,
                [AnhUrl] nvarchar(max) NOT NULL,
                [AnhChinh] bit NOT NULL,
                [NgayTao] datetime2 NOT NULL,
                CONSTRAINT [PK_KhoaHocAnh] PRIMARY KEY ([Id]),
                CONSTRAINT [FK_KhoaHocAnh_KhoaHoc_KhoaHocId] FOREIGN KEY ([KhoaHocId]) REFERENCES [KhoaHoc] ([Id]) ON DELETE CASCADE
            );
            CREATE INDEX [IX_KhoaHocAnh_KhoaHocId] ON [KhoaHocAnh] ([KhoaHocId]);
        END;
    ");

    // Ensure MaGiamGia table has the required columns if they were not created due to schema mismatch
    await db.Database.ExecuteSqlRawAsync(@"
        IF OBJECT_ID(N'[MaGiamGia]') IS NOT NULL
        BEGIN
            IF COL_LENGTH(N'[MaGiamGia]', N'IsPrivate') IS NULL
            BEGIN
                ALTER TABLE [MaGiamGia] ADD [IsPrivate] bit NOT NULL DEFAULT 0;
            END;
            IF COL_LENGTH(N'[MaGiamGia]', N'TrangThai') IS NULL
            BEGIN
                ALTER TABLE [MaGiamGia] ADD [TrangThai] nvarchar(50) NOT NULL DEFAULT 'ACTIVE';
            END;
        END;
    ");
    // Luôn chạy seed data để đảm bảo tài khoản demo và dữ liệu mẫu có sẵn trên cơ sở dữ liệu Cloud
    await SeedData.SeedAsync(db);
}

if (app.Environment.IsDevelopment())
{
    app.MapOpenApi();
}

app.UseCors("Frontend");
app.UseStaticFiles();
app.UseAuthentication();
app.UseAuthorization();

app.MapControllers();
app.MapControllerRoute(
    name: "areas",
    pattern: "{area:exists}/{controller=Dashboard}/{action=Index}/{id?}");
app.MapHub<LMS.Api.Hubs.ChatHub>("/chatHub");

app.Run();

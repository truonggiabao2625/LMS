using System.Security.Claims;
using System.Collections.Concurrent;
using LMS.Api.Infrastructure.Persistence;
using LMS.Api.DTOs.YeuCau;
using LMS.Api.Application.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.SignalR;
using Microsoft.EntityFrameworkCore;

namespace LMS.Api.Hubs;

[Authorize]
public class ChatHub(ApplicationDbContext db, IDichVuChat chat) : Hub
{
    private static readonly ConcurrentDictionary<string, int> ActiveUsers = new();

    public static IEnumerable<string> GetOnlineUserIds()
    {
        return ActiveUsers.Keys;
    }

    public override async Task OnConnectedAsync()
    {
        var userId = Context.User?.FindFirstValue(ClaimTypes.NameIdentifier);
        if (!string.IsNullOrEmpty(userId))
        {
            // Join user to their own personal group to receive messages easily
            await Groups.AddToGroupAsync(Context.ConnectionId, $"user_{userId}");
            
            // Join user to all their conversations
            var conversations = await db.NguoiThamGiaTroChuyen
                .Where(cp => cp.NguoiDungId == userId)
                .Select(cp => cp.CuocTroChuyenId)
                .ToListAsync();

            foreach (var convId in conversations)
            {
                await Groups.AddToGroupAsync(Context.ConnectionId, $"conv_{convId}");
            }

            // Track active status
            ActiveUsers.AddOrUpdate(userId, 1, (key, oldVal) => oldVal + 1);

            // Notify others if this is the first connection tab
            if (ActiveUsers.TryGetValue(userId, out var count) && count == 1)
            {
                var userDetails = await db.NguoiDung
                    .Where(u => u.Id == userId)
                    .Select(u => new { Id = u.Id, Name = u.Ten, Avatar = u.AnhDaiDien, Role = u.VaiTro })
                    .FirstOrDefaultAsync();

                if (userDetails != null)
                {
                    await Clients.All.SendAsync("UserOnline", userDetails);
                }
            }
        }
        await base.OnConnectedAsync();
    }

    public override async Task OnDisconnectedAsync(Exception? exception)
    {
        var userId = Context.User?.FindFirstValue(ClaimTypes.NameIdentifier);
        if (!string.IsNullOrEmpty(userId))
        {
            if (ActiveUsers.TryGetValue(userId, out int count))
            {
                if (count <= 1)
                {
                    ActiveUsers.TryRemove(userId, out _);

                    // Persist LastSeenAt to the database
                    var now = DateTime.UtcNow;
                    var userEntity = await db.NguoiDung.FindAsync(userId);
                    if (userEntity != null)
                    {
                        userEntity.LanCuoiHoatDong = now;
                        await db.SaveChangesAsync();
                    }

                    await Clients.All.SendAsync("UserOffline", new { id = userId, lastSeenAt = now });
                }
                else
                {
                    ActiveUsers.TryUpdate(userId, count - 1, count);
                }
            }
        }
        await base.OnDisconnectedAsync(exception);
    }

    public async Task SendMessage(GuiTinNhanDto request)
    {
        var userId = Context.User?.FindFirstValue(ClaimTypes.NameIdentifier);
        if (string.IsNullOrEmpty(userId)) return;

        var result = await chat.GuiTinNhanAsync(userId, request.ConversationId, request.Content);
        if (!result.ThanhCong || result.GiaTri is null)
        {
            await Clients.Caller.SendAsync("MessageRejected", new { message = result.Loi ?? "Bạn không có quyền gửi tin nhắn này." });
            return;
        }

        foreach (var participantId in result.GiaTri.ParticipantIds)
        {
            await Clients.Group($"user_{participantId}").SendAsync("ReceiveMessage", result.GiaTri.Message);
        }
    }
}

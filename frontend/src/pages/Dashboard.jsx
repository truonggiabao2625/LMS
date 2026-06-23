import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

import axios from 'axios';
import {
  ArrowUpRight,
  Award,
  BarChart2,
  BookOpen,
  CalendarDays,
  Check,
  Eye,
  EyeOff,
  FileCheck,
  Flame,
  GraduationCap,
  Play,
  TrendingUp,
  Users,
  Wallet,
  Trophy,
  RefreshCw,
} from 'lucide-react';
import { useDashboardView } from '../context/DashboardViewContext';
import { StatCard } from '../components/StatCard';
import { getFileUrl } from '../utils/fileUtils';
import CourseProgressCard from '../components/CourseProgressCard';
import CertificateModal from '../components/CertificateModal';


const formatCurrency = (amount = 0) =>
  new Intl.NumberFormat('vi-VN', {
    style: 'currency',
    currency: 'VND',
    maximumFractionDigits: 0,
  }).format(Number(amount || 0));

const STUDENT_WALLET_PRIVACY_KEY = 'student-dashboard-wallet-amounts';

const formatDate = (value) =>
  value
    ? new Intl.DateTimeFormat('vi-VN', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
      }).format(new Date(value))
    : 'Không giới hạn';

const getDashboardEndpoint = (view) => {
  if (view === 'ADMIN') return '/api/admin/dashboard';
  if (view === 'INSTRUCTOR') return '/api/instructor/dashboard';
  return '/api/dashboard';
};

const normalizeDashboardData = (view, payload = {}) => {
  const adminStats = payload.stats ?? payload;

  if (view === 'ADMIN') {
    return {
      stats: {
        totalUsers: adminStats.totalUsers ?? 0,
        totalCourses: adminStats.totalCourses ?? 0,
        totalEnrollments: adminStats.totalEnrollments ?? 0,
        pendingInstructorApplications: adminStats.pendingInstructorApplications ?? 0,
        pendingCourses: adminStats.pendingCourses ?? 0,
        pendingWithdrawals: adminStats.pendingWithdrawals ?? 0,
        pendingPayments: adminStats.pendingPayments ?? 0,
        activeUsers: adminStats.activeUsers ?? adminStats.totalUsers ?? 0,
        activeEvents: adminStats.activeEvents ?? 0,
        activeCoupons: adminStats.activeCoupons ?? 0,
      },
      recentUsers: payload.recentUsers ?? [],
      recentActivities: payload.recentActivities ?? [],
    };
  }

  if (view === 'INSTRUCTOR') {
    const totalRevenue = payload.tongDoanhThu ?? payload.totalRevenue ?? payload.stats?.totalRevenue ?? 0;
    return {
      stats: {
        totalRevenue,
        totalRevenueFormatted: payload.totalRevenueFormatted ?? formatCurrency(totalRevenue),
        totalStudents: payload.tongHocVien ?? payload.totalStudents ?? payload.stats?.totalStudents ?? 0,
        publishedCourses: payload.khoaHocCongKhai ?? payload.publishedCourses ?? payload.stats?.publishedCourses ?? 0,
        draftCourses: payload.khoaHocBanNhap ?? payload.draftCourses ?? payload.stats?.draftCourses ?? 0,
        totalCourses: payload.tongKhoaHoc ?? payload.totalCourses ?? 0,
        averageRating: payload.danhGiaTrungBinh ?? payload.averageRating ?? null,
      },
      bestSellerTitle: payload.khoaHocNhieuHocVienNhat?.tenKhoaHoc ?? payload.khoaHocNhieuHocVienNhat?.title ?? payload.khoaHocNhieuHocVienNhat?.tieuDe ?? null,
      courses: (payload.khoaHocCuaToi ?? payload.courses ?? []).map((course) => ({
        id: course.id,
        title: course.title ?? course.tieuDe ?? course.tenKhoaHoc,
        enrollments: course.enrollments ?? course.soHocVien ?? course.studentCount ?? course.hocVien ?? 0,
        lessons: course.lessons ?? course.soBaiHoc ?? course.lessonCount ?? course.baiHoc ?? 0,
        isPublished: course.isPublished ?? course.congKhai ?? course.daXuatBan ?? ['PUBLIC', 'PUBLISHED'].includes(String(course.status || '').toUpperCase()),
      })),
      recentEnrollments: (payload.hocVienMoi ?? payload.recentEnrollments ?? []).map((enrollment) => ({
        id: enrollment.id,
        studentName: enrollment.studentName ?? enrollment.tenHocVien,
        courseTitle: enrollment.courseTitle ?? enrollment.tenKhoaHoc,
        enrolledAt: enrollment.enrolledAt ?? enrollment.ngayDangKy,
      })),
    };
  }

  return {
    stats: {
      totalEnrolled: payload.totalCourses ?? payload.totalEnrolled ?? 0,
      completedCourses: payload.completedCourses ?? 0,
      completedLessons: payload.completedLessons ?? 0,
      certificates: payload.certificates ?? 0,
      participatedEvents: payload.participatedEvents ?? 0,
      avgProgress: payload.averageProgress ?? payload.avgProgress ?? 0,
      walletBalance: payload.walletBalance ?? 0,
      totalSpent: payload.totalSpent ?? 0,
      rewardPoints: payload.rewardPoints ?? 0,
      loginStreak: payload.loginStreak ?? 0,
      nextLoginReward: payload.nextLoginReward ?? 3,
      dailyLessonCompleted: payload.dailyLessonCompleted ?? false,
      dailyQuizPassed: payload.dailyQuizPassed ?? false,
      weeklyPurchaseCompleted: payload.weeklyPurchaseCompleted ?? false,
    },
    recentCourses: (payload.recentCourses ?? []).map((course) => ({
      ...course,
      progress: Math.min(100, Math.max(0, Math.round(course.progress ?? 0))),
      startedAt: course.purchasedAt ?? course.enrolledAt ?? course.courseStartDate,
    })),
  };
};

const StudentDashboard = ({ data, loading, certificates = [] }) => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [selectedCertificate, setSelectedCertificate] = useState(null);
  const stats = data?.stats;
  const recentCourses = (data?.recentCourses || [])
    .filter((course) => (course.progress ?? 0) < 100)
    .sort((a, b) => (b.progress ?? 0) - (a.progress ?? 0))
    .slice(0, 2);
  const [showWalletAmounts, setShowWalletAmounts] = useState(() => {
    if (typeof window === 'undefined') {
      return true;
    }

    return window.localStorage.getItem(STUDENT_WALLET_PRIVACY_KEY) !== 'hidden';
  });

  useEffect(() => {
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(STUDENT_WALLET_PRIVACY_KEY, showWalletAmounts ? 'visible' : 'hidden');
    }
  }, [showWalletAmounts]);

  const learningPoints = stats?.rewardPoints ?? 0;
  const dailyTasks = [
    {
      icon: Flame,
      title: 'Đăng nhập học mỗi ngày',
      subtitle: `Chuỗi ${stats?.loginStreak ?? 0} ngày`,
      reward: `+${stats?.nextLoginReward ?? 3} điểm`,
      done: (stats?.loginStreak ?? 0) > 0,
      color: 'bg-orange-50 text-orange-500',
    },
    {
      icon: BookOpen,
      title: 'Hoàn thành 1 bài học mỗi ngày',
      subtitle: '',
      reward: '+5 điểm',
      done: Boolean(stats?.dailyLessonCompleted),
      color: 'bg-green-50 text-green-600',
    },
    {
      icon: FileCheck,
      title: 'Làm quiz đạt yêu cầu',
      subtitle: '',
      reward: '+10 điểm',
      done: Boolean(stats?.dailyQuizPassed),
      color: 'bg-blue-50 text-blue-600',
    },
  ];

  return (
    <div className="animate-fade-in-up">
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        <div className="space-y-6 xl:col-span-2">
          <section className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-purple-100 via-purple-50 to-pink-50 p-8">
            <div className="relative z-10 max-w-xl">
              <h2 className="mb-3 text-2xl font-semibold tracking-tight text-purple-950 md:text-3xl">
                Mở khóa hơn 1.000 khóa học cao cấp ngay hôm nay
              </h2>

              <Link
                to="/upgrade"
                className="inline-flex items-center gap-2 rounded-full bg-purple-600 px-6 py-3 text-sm font-medium text-white transition hover:bg-purple-700"
              >
                Nâng cấp Premium
                <ArrowUpRight className="h-4 w-4" />
              </Link>
            </div>
            <div className="absolute right-10 top-1/2 hidden -translate-y-1/2 gap-3 md:grid">
              <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-white/70 text-purple-600 shadow-sm">
                <GraduationCap className="h-8 w-8" />
              </div>
              <div className="ml-16 flex h-14 w-14 items-center justify-center rounded-2xl bg-white/70 text-pink-500 shadow-sm">
                <BookOpen className="h-7 w-7" />
              </div>
            </div>
          </section>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <StatCard
              icon={Check}
              label="Khóa học"
              value={loading ? '...' : `${stats?.completedCourses ?? 0} / ${stats?.totalEnrolled ?? 0}`}
              subtitle="Hoàn thành"
              color="bg-green-100 text-green-600"
              loading={loading}
            />
            <StatCard
              icon={Award}
              label="Chứng chỉ"
              value={loading ? '...' : stats?.certificates ?? 0}
              subtitle="Đã đạt được"
              color="bg-amber-100 text-amber-650"
              loading={loading}
            />
            <StatCard
              icon={CalendarDays}
              label="Sự kiện"
              value={loading ? '...' : stats?.participatedEvents ?? 0}
              subtitle="Đã tham gia"
              color="bg-purple-100 text-purple-600"
              loading={loading}
            />
          </div>

          <section className="rounded-2xl border border-slate-100 bg-white p-4">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-lg font-semibold tracking-tight text-slate-900">Tiếp tục học</h3>
              <Link to="/my-courses" className="text-sm font-medium text-purple-600 hover:underline">
                Xem tất cả
              </Link>
            </div>
            {loading ? (
              <CourseSkeleton />
            ) : recentCourses.length > 0 ? (
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                {recentCourses.map((course) => {
                  const progress = course.progress ?? 0;
                  return (
                    <CourseProgressCard
                      key={course.courseId}
                      title={course.title}
                      thumbnail={course.thumbnail}
                      category={course.category}
                      instructorName={course.instructorName}
                      progress={progress}
                      totalLessons={course.totalLessons || 0}
                      startedAt={course.startedAt}
                      endDate={course.courseEndDate}
                      onContinue={() => navigate(`/learn/${course.courseId}`)}
                      onDetail={() => navigate(`/course/${course.courseId}`)}
                      onViewCertificate={() => {
                        const cert = certificates.find(c => (c.course?.id || c.course?.Id) === course.courseId);
                        setSelectedCertificate({
                          ...cert,
                          studentName: cert?.studentName || user?.name || user?.email || 'Học viên',
                          courseTitle: cert?.courseTitle || course.title,
                          instructorName: cert?.instructorName || course.instructorName,
                        });
                      }}
                    />
                  );
                })}
              </div>
            ) : (
              <div className="py-8 text-center text-slate-400">
                <BookOpen className="mx-auto mb-2 h-8 w-8 text-slate-300" />
                <Link to="/explore" className="mt-1 inline-block text-sm font-medium text-purple-600 hover:underline">
                  Khám phá ngay
                </Link>
              </div>
            )}
          </section>
        </div>

        <aside className="space-y-6">
          <section className="rounded-2xl border border-slate-100 bg-white p-6">
            <div className="mb-4 flex items-center justify-between gap-3">
              <h3 className="text-xl font-semibold tracking-tight text-slate-900">Ví của tôi</h3>
              {!loading && (
                <button
                  type="button"
                  onClick={() => setShowWalletAmounts((current) => !current)}
                  className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-slate-200 text-slate-500 transition hover:border-purple-200 hover:bg-purple-50 hover:text-purple-600"
                  title={showWalletAmounts ? 'Ẩn số tiền' : 'Hiện số tiền'}
                  aria-label={showWalletAmounts ? 'Ẩn số tiền trong ví' : 'Hiện số tiền trong ví'}
                  aria-pressed={!showWalletAmounts}
                >
                  {showWalletAmounts ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              )}
            </div>
            {loading ? (
              <div className="space-y-3">
                <div className="h-8 w-32 animate-pulse rounded bg-slate-100" />
                <div className="h-4 w-24 animate-pulse rounded bg-slate-100" />
              </div>
            ) : (
              <>
                <p className="mb-1 text-3xl font-bold text-slate-900">
                  {showWalletAmounts ? formatCurrency(stats?.walletBalance ?? 0) : '••••••'}
                </p>
                <p className="mb-4 text-xs text-slate-400">
                  Đã chi: {showWalletAmounts ? formatCurrency(stats?.totalSpent ?? 0) : '••••••'}
                </p>
                <Link
                  to="/upgrade"
                  className="flex w-full items-center justify-center gap-2 rounded-xl bg-purple-600 py-3 text-sm font-medium text-white transition hover:bg-purple-700"
                >
                  <Wallet className="h-4 w-4" />
                  Nạp ví
                </Link>
              </>
            )}
          </section>

          <section className="rounded-2xl border border-slate-100 bg-white p-6">
            <div className="mb-5 flex items-center justify-between">
              <h3 className="text-xl font-semibold tracking-tight text-slate-900">Nhiệm vụ hằng ngày</h3>
              <Link to="/events" className="text-sm font-medium text-purple-600 hover:text-purple-700">
                Đổi điểm
              </Link>
            </div>
            <div className="space-y-5">
              <QuestRow
                icon={Award}
                title="Điểm học tập hiện có"
                subtitle=""
                color="bg-purple-50 text-purple-600"
                right={`${learningPoints} điểm`}
              />
              {dailyTasks.map((task) => (
                <QuestRow key={task.title} {...task} />
              ))}
            </div>
          </section>
        </aside>
      </div>
      {selectedCertificate && (
        <CertificateModal
          certificate={selectedCertificate}
          onClose={() => setSelectedCertificate(null)}
        />
      )}
    </div>
  );
};

const InstructorDashboard = ({ data, loading }) => {
  const stats = data?.stats;
  const courses = data?.courses || [];
  const recentEnrollments = data?.recentEnrollments || [];

  return (
    <div className="animate-fade-in-up space-y-6">
      <section className="rounded-2xl border border-purple-100 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-purple-600">Khu vực giảng viên</p>
            <h2 className="mt-2 text-2xl font-semibold tracking-tight text-slate-900">Quản lý và tạo khóa học</h2>
            <p className="mt-1 text-sm text-slate-500">Theo dõi doanh thu, học viên mới và trạng thái khóa học của bạn.</p>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Link to="/instructor/courses" className="rounded-xl border border-slate-200 bg-white px-5 py-3 text-center text-sm font-semibold text-slate-700 hover:bg-slate-50">
              Quản lý khóa học
            </Link>
            <Link to="/instructor/courses/new" className="rounded-xl bg-purple-600 px-5 py-3 text-center text-sm font-semibold text-white hover:bg-purple-700">
              Tạo khóa học mới
            </Link>
          </div>
        </div>
      </section>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <StatCard icon={Users} label="Tổng học viên" value={stats?.totalStudents ?? 0} subtitle="Đã ghi danh" color="bg-blue-50 text-blue-600" loading={loading} />
        <StatCard icon={BookOpen} label="Tổng khóa học" value={stats?.totalCourses ?? 0} subtitle="Tất cả khóa học" color="bg-purple-50 text-purple-600" loading={loading} />
        <StatCard icon={RefreshCw} label="Khóa học công khai" value={stats?.publishedCourses ?? 0} subtitle={`${stats?.draftCourses ?? 0} bản nháp`} color="bg-sky-50 text-sky-600" loading={loading} />
        <StatCard icon={TrendingUp} label="Đánh giá TB" value={stats?.averageRating ? `${Number(stats.averageRating).toFixed(1)}/5` : 'Chưa có'} subtitle="Từ học viên" color="bg-amber-50 text-amber-600" loading={loading} />
        <StatCard icon={Trophy} label="Khóa học bán chạy nhất" value={data?.bestSellerTitle || 'Chưa có'} subtitle="Được học viên yêu thích" color="bg-rose-50 text-rose-600" loading={loading} />
        <StatCard icon={Wallet} label="Tổng doanh thu" value={stats?.totalRevenueFormatted ?? formatCurrency(0)} subtitle="Doanh số tích lũy" color="bg-emerald-50 text-emerald-600" loading={loading} />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <section className="overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-sm">
          <div className="flex items-center justify-between border-b border-slate-100 p-5">
            <h3 className="font-semibold text-slate-900">Khóa học của bạn</h3>
            <Link to="/instructor/courses" className="text-sm font-medium text-purple-600 hover:underline">
              Quản lý
            </Link>
          </div>
          {loading ? (
            <div className="p-4">
              <ListSkeleton />
            </div>
          ) : courses.length > 0 ? (
            <div className="divide-y divide-slate-50">
              {courses.slice(0, 5).map((course) => (
                <Link key={course.id} to={`/instructor/courses/${course.id}`} className="flex items-center gap-3 p-4 transition hover:bg-slate-50">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-purple-100 to-pink-100">
                    <BookOpen className="h-5 w-5 text-purple-600" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-slate-900">{course.title}</p>
                    <p className="text-xs text-slate-400">{course.enrollments} học viên · {course.lessons} bài</p>
                  </div>
                  <StatusPill active={course.isPublished} />
                </Link>
              ))}
            </div>
          ) : (
            <div className="p-6 text-center text-sm text-slate-400">Chưa có khóa học nào.</div>
          )}
        </section>

        <section className="rounded-2xl border border-slate-100 bg-white shadow-sm">
          <div className="flex items-center justify-between border-b border-slate-100 p-5">
            <h3 className="font-semibold text-slate-900">Học viên mới đăng ký</h3>
            <Link to="/instructor/revenue" className="text-sm font-medium text-purple-600 hover:underline">
              Xem tất cả
            </Link>
          </div>
          <div className="p-2">
            {loading ? (
              <ListSkeleton />
            ) : recentEnrollments.length > 0 ? (
              <div className="space-y-1">
                {recentEnrollments.slice(0, 5).map((enrollment, index) => (
                  <div key={enrollment.id || index} className="flex items-center gap-3 rounded-xl p-3 transition hover:bg-slate-50">
                    <Avatar name={enrollment.studentName} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-slate-900">{enrollment.studentName}</p>
                      <p className="truncate text-xs text-slate-400">{enrollment.courseTitle}</p>
                    </div>
                    <span className="shrink-0 text-xs text-slate-400">{formatDate(enrollment.enrolledAt)}</span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="py-6 text-center text-sm text-slate-400">Chưa có học viên mới đăng ký.</p>
            )}
          </div>
        </section>
      </div>
    </div>
  );
};

const getActivityConfig = (title = '', description = '') => {
  const text = (title + ' ' + description).toLowerCase();
  if (text.includes('rút tiền') || text.includes('giao dịch') || text.includes('thanh toán') || text.includes('tiền')) {
    return { icon: Wallet, style: 'bg-emerald-50 text-emerald-600 border-emerald-100 dark:bg-emerald-950/20 dark:text-emerald-400' };
  }
  if (text.includes('khóa học') || text.includes('khoá học') || text.includes('bài học')) {
    return { icon: BookOpen, style: 'bg-purple-50 text-purple-600 border-purple-100 dark:bg-purple-950/20 dark:text-purple-400' };
  }
  if (text.includes('giảng viên') || text.includes('đối tác') || text.includes('hồ sơ')) {
    return { icon: GraduationCap, style: 'bg-blue-50 text-blue-600 border-blue-100 dark:bg-blue-950/20 dark:text-blue-400' };
  }
  if (text.includes('người dùng') || text.includes('tài khoản') || text.includes('đăng ký')) {
    return { icon: Users, style: 'bg-indigo-50 text-indigo-600 border-indigo-100 dark:bg-indigo-950/20 dark:text-indigo-400' };
  }
  return { icon: FileCheck, style: 'bg-slate-50 text-slate-600 border-slate-100 dark:bg-slate-900 dark:text-slate-400' };
};

const AdminDashboard = ({ data, loading }) => {
  const stats = data?.stats || data || {};
  const recentUsers = data?.recentUsers || [];
  const recentActivities = data?.recentActivities || [];
  const roleLabels = {
    STUDENT: 'Học viên',
    INSTRUCTOR: 'Giảng viên',
    ADMIN: 'Admin',
  };
  const taskItems = [
    {
      label: 'Hồ sơ giảng viên chờ duyệt',
      value: stats.pendingInstructorApplications ?? 0,
      to: '/admin/instructor-applications',
      icon: FileCheck,
      color: 'bg-rose-50 text-rose-600',
    },
    {
      label: 'Khóa học chờ duyệt',
      value: stats.pendingCourses ?? 0,
      to: '/admin/courses',
      icon: BookOpen,
      color: 'bg-amber-50 text-amber-600',
    },
    {
      label: 'Yêu cầu rút tiền chờ xử lý',
      value: stats.pendingWithdrawals ?? 0,
      to: '/admin/transactions',
      icon: Wallet,
      color: 'bg-sky-50 text-sky-600',
    },
    {
      label: 'Giao dịch cần kiểm tra',
      value: stats.pendingPayments ?? 0,
      to: '/admin/transactions',
      icon: BarChart2,
      color: 'bg-orange-50 text-orange-600',
      hideWhenZero: true,
    },
  ].filter((item) => !item.hideWhenZero || item.value > 0);

  return (
    <div className="animate-fade-in-up space-y-6">
      <div>
        <h1 className="mb-1 text-2xl font-semibold tracking-tight text-slate-900 md:text-3xl">Dashboard Quản trị</h1>
        <p className="text-sm text-slate-500">Xem tổng quan số liệu hệ thống và xử lý các yêu cầu cần phê duyệt.</p>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        <AdminStatLink to="/admin/users" icon={Users} label="Tổng người dùng" value={stats.totalUsers ?? 0} subtitle="Toàn hệ thống" color="bg-blue-50 text-blue-600" loading={loading} />
        <AdminStatLink to="/admin/courses" icon={BookOpen} label="Tổng khóa học" value={stats.totalCourses ?? 0} subtitle="Tất cả trạng thái" color="bg-purple-50 text-purple-600" loading={loading} />
        <AdminStatLink to="/admin/instructor-applications" icon={FileCheck} label="Hồ sơ GV chờ duyệt" value={stats.pendingInstructorApplications ?? 0} subtitle="Cần Admin xử lý" color="bg-rose-50 text-rose-600" loading={loading} />
        <AdminStatLink to="/admin/courses" icon={CalendarDays} label="Khóa học chờ duyệt" value={stats.pendingCourses ?? 0} subtitle="Chờ kiểm duyệt" color="bg-amber-50 text-amber-600" loading={loading} />
      </div>

      <section className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
        <h3 className="mb-4 font-semibold text-slate-900">Việc cần xử lý</h3>
        {loading ? (
          <ListSkeleton />
        ) : taskItems.length > 0 ? (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
            {taskItems.map((item) => (
              <AdminTaskItem key={item.label} {...item} />
            ))}
          </div>
        ) : (
          <p className="rounded-xl bg-slate-50 px-4 py-5 text-center text-sm text-slate-500 border border-slate-100">Không có việc cần xử lý.</p>
        )}
      </section>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-3">
        <section className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm xl:col-span-2">
          <div className="mb-4 flex items-center justify-between border-b border-slate-50 pb-4">
            <h3 className="font-semibold text-slate-900">Người dùng mới nhất</h3>
            <Link to="/admin/users" className="text-sm font-medium text-purple-600 hover:underline">
              Tất cả
            </Link>
          </div>
          {loading ? (
            <ListSkeleton />
          ) : recentUsers.length > 0 ? (
            <div className="divide-y divide-slate-100">
              {recentUsers.map((user) => {
                const role = (user.vaiTro || user.role || '').toUpperCase();
                let roleBadgeClass = 'bg-slate-100 text-slate-600 border-slate-200';
                if (role === 'ADMIN') {
                  roleBadgeClass = 'bg-rose-50 text-rose-700 border-rose-100';
                } else if (role === 'INSTRUCTOR') {
                  roleBadgeClass = 'bg-purple-50 text-purple-700 border-purple-100';
                } else if (role === 'STUDENT') {
                  roleBadgeClass = 'bg-blue-50 text-blue-700 border-blue-100';
                }

                return (
                  <div key={user.id} className="flex items-center justify-between gap-3 py-3.5 first:pt-0 last:pb-0 transition-colors hover:bg-slate-50/40 px-1 rounded-lg">
                    <div className="flex items-center gap-3 min-w-0">
                      <Avatar name={user.ten || user.name || user.email} />
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-slate-800">{user.ten || user.name || user.email}</p>
                        <p className="truncate text-xs text-slate-400 mt-0.5">{user.email}</p>
                      </div>
                    </div>
                    <div className="shrink-0 text-right flex flex-col items-end gap-1">
                      <span className={`rounded-full border px-2.5 py-0.5 text-[10px] font-semibold tracking-wide uppercase ${roleBadgeClass}`}>
                        {roleLabels[role] || role}
                      </span>
                      {user.createdAt ? (
                        <p className="text-[10px] text-slate-400 mt-1">{formatDate(user.createdAt)}</p>
                      ) : null}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="py-6 text-center text-sm text-slate-400">Chưa có người dùng mới.</p>
          )}
        </section>

        <section className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
          <h3 className="mb-4 font-semibold text-slate-900">Tổng quan nền tảng</h3>
          <div className="space-y-3">
            <OverviewRow icon={GraduationCap} label="Tổng lượt ghi danh" value={stats.totalEnrollments ?? 0} color="purple" />
            <OverviewRow icon={Users} label="Người dùng hoạt động" value={stats.activeUsers ?? 0} color="blue" />
            {(stats.activeEvents ?? 0) > 0 ? (
              <OverviewRow icon={CalendarDays} label="Sự kiện đang mở" value={stats.activeEvents ?? 0} color="amber" />
            ) : (
              <OverviewRow icon={FileCheck} label="Mã giảm giá đang hoạt động" value={stats.activeCoupons ?? 0} color="amber" />
            )}
          </div>
        </section>
      </div>

      {!loading && recentActivities.length > 0 ? (
        <section className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
          <h3 className="mb-4 font-semibold text-slate-900">Hoạt động gần đây</h3>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            {recentActivities.map((item, index) => {
              const { icon: ActivityIcon, style } = getActivityConfig(item.title, item.description);
              return (
                <Link
                  key={`${item.type || 'activity'}-${item.createdAt || index}`}
                  to={item.link || '/admin'}
                  className="flex items-center gap-3 rounded-xl border border-slate-100 p-3.5 transition hover:border-purple-200 hover:shadow-sm bg-white"
                >
                  <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border ${style}`}>
                    <ActivityIcon className="h-5 w-5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-slate-800">{item.title}</p>
                    <p className="truncate text-xs text-slate-500 mt-0.5">{item.description}</p>
                  </div>
                  <div className="shrink-0 text-right">
                    <span className="text-[10px] text-slate-400 font-medium bg-slate-50 px-2 py-0.5 rounded-md border border-slate-100">
                      {item.createdAt ? formatDate(item.createdAt) : ''}
                    </span>
                  </div>
                </Link>
              );
            })}
          </div>
        </section>
      ) : null}
    </div>
  );
};

const Dashboard = () => {
  const { activeView } = useDashboardView();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [certificates, setCertificates] = useState([]);

  useEffect(() => {
    setLoading(true);
    setData(null);
    setCertificates([]);

    const fetchStats = async () => {
      try {
        const response = await axios.get(getDashboardEndpoint(activeView));
        setData(normalizeDashboardData(activeView, response.data));

        if (activeView === 'STUDENT') {
          const certRes = await axios.get('/api/user/certificates').catch(() => ({ data: [] }));
          setCertificates(Array.isArray(certRes.data) ? certRes.data : []);
        }
      } catch (error) {
        console.error('Dashboard fetch error:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchStats();
  }, [activeView]);

  if (activeView === 'ADMIN') {
    return <AdminDashboard data={data} loading={loading} />;
  }

  if (activeView === 'INSTRUCTOR') {
    return <InstructorDashboard data={data} loading={loading} />;
  }

  return <StudentDashboard data={data} loading={loading} certificates={certificates} />;
};

const CourseSkeleton = () => (
  <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
    {[1, 2, 3].map((item) => (
      <div key={item} className="animate-pulse">
        <div className="mb-3 aspect-video rounded-xl bg-slate-100" />
        <div className="mb-2 h-3 w-24 rounded bg-slate-100" />
        <div className="h-4 w-36 rounded bg-slate-100" />
      </div>
    ))}
  </div>
);

const AdminStatLink = ({ to, icon: Icon, label, value, subtitle, color, loading = false }) => {
  if (loading) return <StatCard icon={Icon} label={label} value={value} subtitle={subtitle} color={color} loading />;

  return (
    <Link to={to} className="block rounded-2xl focus:outline-none focus:ring-2 focus:ring-purple-205 transition hover:-translate-y-0.5 hover:shadow-[0_4px_12px_rgba(0,0,0,0.015)]">
      <StatCard icon={Icon} label={label} value={value} subtitle={subtitle} color={color} />
    </Link>
  );
};

const AdminTaskItem = ({ icon: Icon, label, value, to, color }) => {
  let parsedIconColor = color;
  if (color.includes('rose')) {
    parsedIconColor = 'bg-rose-50 text-rose-600 dark:bg-rose-950/30 dark:text-rose-400';
  } else if (color.includes('amber')) {
    parsedIconColor = 'bg-amber-50 text-amber-600 dark:bg-amber-950/30 dark:text-amber-400';
  } else if (color.includes('sky')) {
    parsedIconColor = 'bg-sky-50 text-sky-600 dark:bg-sky-950/30 dark:text-sky-400';
  } else if (color.includes('orange')) {
    parsedIconColor = 'bg-orange-50 text-orange-600 dark:bg-orange-950/30 dark:text-orange-400';
  }

  return (
    <div className="flex items-center justify-between gap-3 rounded-xl border border-slate-100 bg-white p-4 transition-all duration-200 hover:border-purple-200 hover:shadow-sm">
      <div className="flex items-center gap-3 min-w-0">
        <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${parsedIconColor}`}>
          <Icon className="h-5 w-5" />
        </div>
        <div className="min-w-0">
          <p className="truncate text-xs font-medium text-slate-500">{label}</p>
          <p className="text-lg font-bold text-slate-900 mt-0.5">{value}</p>
        </div>
      </div>
      <Link
        to={to}
        className="rounded-lg bg-white px-3 py-1.5 text-xs font-semibold text-purple-700 shadow-sm ring-1 ring-purple-100/50 transition hover:bg-purple-50 shrink-0"
      >
        Xem
      </Link>
    </div>
  );
};

const ListSkeleton = () => (
  <div className="space-y-3">
    {[1, 2, 3].map((item) => (
      <div key={item} className="flex animate-pulse items-center gap-3">
        <div className="h-10 w-10 rounded-full bg-slate-100" />
        <div className="flex-1 space-y-2">
          <div className="h-3 w-28 rounded bg-slate-100" />
          <div className="h-3 w-40 rounded bg-slate-100" />
        </div>
      </div>
    ))}
  </div>
);

const CourseDate = ({ label, value }) => (
  <div>
    <span className="flex items-center gap-1 text-slate-400">
      <CalendarDays className="h-3 w-3" />
      {label}
    </span>
    <span className="mt-0.5 block font-medium text-slate-700">{formatDate(value)}</span>
  </div>
);

const QuestRow = ({ icon: Icon, title, subtitle, color, right, done, reward }) => (
  <div className="flex items-center gap-3">
    <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${color}`}>
      <Icon className="h-5 w-5" />
    </div>
    <div className="min-w-0 flex-1">
      <p className="text-sm font-medium text-slate-900">{title}</p>
      {subtitle && <p className="text-xs text-slate-500">{subtitle}</p>}
    </div>
    {right ? (
      <span className="text-lg font-bold text-purple-700">{right}</span>
    ) : (
      <div className="shrink-0 text-right">
        <p className="text-xs font-semibold text-purple-600">{reward}</p>
        <p className={`text-sm font-bold ${done ? 'text-emerald-600' : 'text-slate-500'}`}>{done ? '1/1' : '0/1'}</p>
      </div>
    )}
  </div>
);

const Avatar = ({ name = '' }) => (
  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-purple-300 to-pink-300 font-bold text-white shadow-sm">
    {(name || 'A').trim().charAt(0).toUpperCase()}
  </div>
);

const StatusPill = ({ active }) => (
  <span className={`rounded-full px-2 py-1 text-[10px] font-semibold ${active ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
    {active ? 'Công khai' : 'Nháp'}
  </span>
);

const OverviewRow = ({ icon: Icon, label, value, color }) => {
  const classes = {
    purple: 'border-purple-100 from-purple-50 to-pink-50 text-purple-700',
    blue: 'border-blue-100 from-blue-50 to-cyan-50 text-blue-700',
    amber: 'border-amber-100 from-amber-50 to-orange-50 text-amber-700',
  };

  return (
    <div className={`flex items-center justify-between rounded-xl border bg-gradient-to-r p-4 transition-all duration-200 hover:shadow-sm ${classes[color]}`}>
      <div className="flex items-center gap-3">
        <Icon className="h-5 w-5" />
        <span className="text-sm font-medium text-slate-800">{label}</span>
      </div>
      <span className="text-lg font-bold tracking-tight text-slate-900">{value}</span>
    </div>
  );
};

export default Dashboard;

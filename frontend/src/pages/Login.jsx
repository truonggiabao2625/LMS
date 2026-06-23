import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { ArrowRight, Loader2 } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import {
  AuthAlert,
  AuthCheckbox,
  AuthPasswordField,
  AuthSocialButton,
  AuthTextField,
  SkillioBrand,
} from '../components/AuthShell';

const isValidEmail = (value) => /\S+@\S+\.\S+/.test(value);

const getLoginRedirectPath = (user) => {
  if (user?.role === 'INSTRUCTOR') return '/instructor/dashboard';
  if (user?.role === 'ADMIN') return '/admin';
  return '/';
};

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);
  const [error, setError] = useState('');
  const [fieldErrors, setFieldErrors] = useState({});
  const [isLoading, setIsLoading] = useState(false);
  const [socialLoading, setSocialLoading] = useState('');

  const { login, startSocialLogin } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    if (params.get('reason') === 'kickout') {
      setError('Tài khoản của bạn đã được đăng nhập từ một thiết bị khác. Phiên làm việc này đã bị kết thúc.');
      navigate('/login', { replace: true });
    }
  }, [location.search, navigate]);

  const normalizedEmail = useMemo(() => email.trim(), [email]);

  const validate = () => {
    const nextErrors = {};

    if (!normalizedEmail) {
      nextErrors.email = 'Vui lòng nhập email.';
    } else if (!isValidEmail(normalizedEmail)) {
      nextErrors.email = 'Email chưa đúng định dạng.';
    }

    if (!password) {
      nextErrors.password = 'Vui lòng nhập mật khẩu.';
    }

    setFieldErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError('');

    if (!validate()) {
      return;
    }

    try {
      setIsLoading(true);
      const user = await login(normalizedEmail, password);
      sessionStorage.removeItem('skillio_student_preview');
      const fromPath = location.state?.from || getLoginRedirectPath(user);
      navigate(fromPath, { replace: true });
    } catch (err) {
      setError(err.response?.data?.message || 'Đăng nhập thất bại. Vui lòng thử lại.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSocialLogin = async (provider) => {
    setError('');
    setSocialLoading(provider);

    try {
      await startSocialLogin(provider);
    } catch (err) {
      setError(err.message || `Không thể đăng nhập bằng ${provider}.`);
      setSocialLoading('');
    }
  };

  const handleForgotPassword = (event) => {
    event.preventDefault();
    alert('Hệ thống Demo hiện sử dụng các tài khoản mặc định sau:\n\n' +
          '1. Học viên: student@gmail.com / 123456\n' +
          '2. Giảng viên: instructor@gmail.com / 123456\n' +
          '3. Quản trị viên: admin@gmail.com / 123456\n\n' +
          'Vui lòng sử dụng các thông tin đăng nhập trên.');
  };

  return (
    <div className="min-h-[100dvh] bg-white font-sans text-slate-900">
      <main className="mx-auto grid min-h-[100dvh] max-w-7xl lg:grid-cols-[minmax(0,1fr)_minmax(420px,0.92fr)]">
        <section className="flex items-center justify-center px-6 py-10 sm:px-8 lg:px-14">
          <div className="w-full max-w-md">
            <SkillioBrand />

            <div className="mb-7">
              <h1 className="text-3xl font-bold text-slate-950">Chào mừng trở lại</h1>
              <p className="mt-2 text-sm leading-6 text-slate-500">
                Đăng nhập để tiếp tục học và quản lý tài khoản Skillio của bạn.
              </p>
            </div>

            <div className="rounded-2xl border border-slate-100 bg-white p-6 shadow-[0_18px_45px_rgba(15,23,42,0.08)] sm:p-8">
              <form className="space-y-4" onSubmit={handleSubmit} noValidate>
                {error ? <AuthAlert>{error}</AuthAlert> : null}

                <AuthTextField
                  id="login-email"
                  label="Email"
                  type="email"
                  value={email}
                  onChange={(event) => {
                    setEmail(event.target.value);
                    setFieldErrors((current) => ({ ...current, email: '' }));
                  }}
                  placeholder="you@example.com"
                  disabled={isLoading}
                  error={fieldErrors.email}
                  autoComplete="email"
                />

                <AuthPasswordField
                  id="login-password"
                  label="Mật khẩu"
                  labelAction={
                    <button
                      type="button"
                      onClick={handleForgotPassword}
                      className="text-xs font-semibold text-purple-600 transition hover:text-purple-700 bg-transparent border-none p-0 cursor-pointer"
                    >
                      Quên mật khẩu?
                    </button>
                  }
                  value={password}
                  onChange={(event) => {
                    setPassword(event.target.value);
                    setFieldErrors((current) => ({ ...current, password: '' }));
                  }}
                  placeholder="Nhập mật khẩu"
                  disabled={isLoading}
                  error={fieldErrors.password}
                  showPassword={showPassword}
                  onTogglePassword={() => setShowPassword((visible) => !visible)}
                  autoComplete="current-password"
                />

                <AuthCheckbox checked={rememberMe} onChange={() => setRememberMe((current) => !current)} disabled={isLoading}>
                  Ghi nhớ đăng nhập trên thiết bị này
                </AuthCheckbox>

                <button
                  type="submit"
                  disabled={isLoading}
                  className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-purple-600 via-purple-700 to-fuchsia-600 px-4 py-3 text-sm font-semibold text-white shadow-lg shadow-purple-200/60 transition hover:from-purple-700 hover:via-purple-800 hover:to-fuchsia-700 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {isLoading ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Đang đăng nhập...
                    </>
                  ) : (
                    <>
                      Đăng nhập
                      <ArrowRight className="h-4 w-4" />
                    </>
                  )}
                </button>
              </form>

              <div className="my-6 flex items-center gap-3">
                <div className="h-px flex-1 bg-slate-200" />
                <span className="text-xs font-medium text-slate-400">hoặc tiếp tục với</span>
                <div className="h-px flex-1 bg-slate-200" />
              </div>

              <div className="space-y-3">
                <AuthSocialButton
                  provider="Google"
                  onClick={() => handleSocialLogin('Google')}
                  disabled={isLoading || Boolean(socialLoading)}
                  loading={socialLoading === 'Google'}
                />
              </div>
            </div>

            <p className="mt-6 text-center text-sm text-slate-500">
              Chưa có tài khoản?{' '}
              <Link to="/register" className="font-semibold text-purple-600 transition hover:text-purple-700">
                Đăng ký miễn phí
              </Link>
            </p>
          </div>
        </section>

        <aside className="hidden items-center justify-center border-l border-purple-100 bg-white p-6 lg:flex">
          <div className="flex min-h-[calc(100dvh-3rem)] w-full items-center justify-center rounded-[28px] border border-purple-100 bg-purple-50 px-12 py-10 shadow-[inset_0_1px_0_rgba(255,255,255,0.7)]">
            <div className="max-w-md">
              <p className="mb-5 inline-flex rounded-full border border-purple-200 bg-white/60 px-3 py-1 text-[11px] font-bold uppercase text-purple-600">
                Skillio LMS
              </p>
              <h2 className="text-4xl font-bold leading-tight text-purple-950">
                Học tập không giới hạn cùng Skillio.
              </h2>
              <p className="mt-5 text-sm leading-7 text-slate-600">
                Một tài khoản cho học tập, giảng dạy và quản lý toàn bộ hành trình phát triển kỹ năng.
              </p>

              <div className="mt-10 space-y-5 border-t border-purple-100 pt-8">
                {[
                  ['Học tập đa lĩnh vực', 'Truy cập các khóa học chất lượng cao từ lập trình, thiết kế đến quản trị và ngoại ngữ.'],
                  ['Lộ trình được tinh gọn', 'Theo dõi tiến trình, quay lại bài học đang dang dở và duy trì nhịp học đều đặn.'],
                  ['Chứng nhận chuẩn đầu ra', 'Hoàn thành khóa học và bổ sung chứng nhận vào hồ sơ chuyên môn của bạn.'],
                ].map(([title, description]) => (
                  <div key={title} className="flex gap-3">
                    <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-purple-600" />
                    <div>
                      <h3 className="text-xs font-bold uppercase text-purple-950">{title}</h3>
                      <p className="mt-1 text-sm leading-6 text-slate-600">{description}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </aside>
      </main>
    </div>
  );
}

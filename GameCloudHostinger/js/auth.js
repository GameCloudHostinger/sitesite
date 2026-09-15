// Cadastro, login, logout, recuperação e definição de nova senha.
import { supabase } from './supabase.js';
import { showAlert, authErrorMessage, initChrome } from './ui.js';
import { resumePendingCheckout } from './checkout.js';
import { loadProductBySlug } from './products.js';

initChrome();

const params = new URLSearchParams(location.search);
const nextPage = params.get('next') || 'dashboard.html';

async function afterLogin() {
  const resumed = await resumePendingCheckout(loadProductBySlug);
  if (!resumed) location.href = nextPage;
}

// ---------------- Login ----------------
const loginForm = document.getElementById('loginForm');
if (loginForm) {
  // Já logado? Vai direto.
  supabase.auth.getUser().then(({ data }) => { if (data?.user) afterLogin(); });

  loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const box = document.getElementById('formMsg');
    const btn = loginForm.querySelector('button[type=submit]');
    showAlert(box, '');
    btn.disabled = true; btn.textContent = 'Entrando...';

    const { error } = await supabase.auth.signInWithPassword({
      email: loginForm.email.value.trim().toLowerCase(),
      password: loginForm.password.value,
    });

    btn.disabled = false; btn.textContent = 'Entrar';
    if (error) return showAlert(box, authErrorMessage(error), 'error');
    await afterLogin();
  });
}

// ---------------- Cadastro ----------------
const registerForm = document.getElementById('registerForm');
if (registerForm) {
  registerForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const box = document.getElementById('formMsg');
    const btn = registerForm.querySelector('button[type=submit]');
    showAlert(box, '');

    const fullName = registerForm.fullName.value.trim();
    const email    = registerForm.email.value.trim().toLowerCase();
    const password = registerForm.password.value;
    const confirm  = registerForm.confirmPassword.value;

    if (fullName.length < 3)  return showAlert(box, 'Escreva seu nome completo.', 'error');
    if (password.length < 8)  return showAlert(box, 'Use uma senha com pelo menos 8 caracteres.', 'error');
    if (password !== confirm) return showAlert(box, 'As duas senhas não são iguais.', 'error');

    btn.disabled = true; btn.textContent = 'Criando conta...';
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { full_name: fullName },
        emailRedirectTo: `${location.origin}${location.pathname.replace(/register\.html$/, 'login.html')}`,
      },
    });
    btn.disabled = false; btn.textContent = 'Criar conta';

    if (error) return showAlert(box, authErrorMessage(error), 'error');

    // Com confirmação de e-mail ligada, session vem nula.
    if (!data.session) {
      registerForm.reset();
      return showAlert(box, 'Conta criada. Confirme o e-mail que enviamos para ativar seu acesso.', 'ok');
    }
    await afterLogin();
  });
}

// ---------------- Recuperar senha ----------------
const recoverForm = document.getElementById('recoverForm');
if (recoverForm) {
  recoverForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const box = document.getElementById('formMsg');
    const btn = recoverForm.querySelector('button[type=submit]');
    showAlert(box, '');
    btn.disabled = true; btn.textContent = 'Enviando...';

    const redirect = `${location.origin}${location.pathname.replace(/recuperar-senha\.html$/, 'nova-senha.html')}`;
    const { error } = await supabase.auth.resetPasswordForEmail(
      recoverForm.email.value.trim().toLowerCase(),
      { redirectTo: redirect }
    );

    btn.disabled = false; btn.textContent = 'Enviar link de recuperação';
    if (error) return showAlert(box, authErrorMessage(error), 'error');
    showAlert(box, 'Se existir uma conta com esse e-mail, o link de recuperação chegou na caixa de entrada.', 'ok');
    recoverForm.reset();
  });
}

// ---------------- Nova senha ----------------
const newPasswordForm = document.getElementById('newPasswordForm');
if (newPasswordForm) {
  const box = document.getElementById('formMsg');
  let recoveryReady = false;

  supabase.auth.onAuthStateChange((event) => {
    if (event === 'PASSWORD_RECOVERY' || event === 'SIGNED_IN') recoveryReady = true;
  });
  supabase.auth.getSession().then(({ data }) => { if (data?.session) recoveryReady = true; });

  newPasswordForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    showAlert(box, '');
    const password = newPasswordForm.password.value;
    if (password.length < 8) return showAlert(box, 'Use uma senha com pelo menos 8 caracteres.', 'error');
    if (password !== newPasswordForm.confirmPassword.value) return showAlert(box, 'As duas senhas não são iguais.', 'error');
    if (!recoveryReady) return showAlert(box, 'Abra esta página pelo link que enviamos por e-mail.', 'error');

    const btn = newPasswordForm.querySelector('button[type=submit]');
    btn.disabled = true; btn.textContent = 'Salvando...';
    const { error } = await supabase.auth.updateUser({ password });
    btn.disabled = false; btn.textContent = 'Salvar nova senha';

    if (error) return showAlert(box, authErrorMessage(error), 'error');
    showAlert(box, 'Senha alterada. Redirecionando para sua área...', 'ok');
    setTimeout(() => (location.href = 'dashboard.html'), 1500);
  });
}

// ---------------- Logout (qualquer página) ----------------
document.addEventListener('click', async (e) => {
  if (e.target.closest('[data-logout]')) {
    e.preventDefault();
    await supabase.auth.signOut();
    location.href = 'index.html';
  }
});

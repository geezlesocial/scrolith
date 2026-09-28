import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const guestAuth = readFileSync(
  join(root, 'src/components/sections/GuestAuthExperience.tsx'),
  'utf8'
);
const app = readFileSync(join(root, 'src/App.tsx'), 'utf8');
const login = readFileSync(join(root, 'src/auth/Login.tsx'), 'utf8');
const signup = readFileSync(join(root, 'src/auth/Signup.tsx'), 'utf8');
const userContext = readFileSync(join(root, 'src/context/UserContext.tsx'), 'utf8');

test('guest auth modal exposes links to the dedicated secure auth pages', () => {
  const modalStart = guestAuth.indexOf('export const GuestAuthModal');
  assert.notEqual(modalStart, -1, 'guest auth modal should exist');
  const modalSource = guestAuth.slice(modalStart);
  const cardStart = modalSource.indexOf('<GuestAuthCard');
  assert.notEqual(cardStart, -1, 'guest auth modal should render the guest auth card');
  const cardSource = modalSource.slice(cardStart, modalSource.indexOf('/>', cardStart));

  assert.doesNotMatch(cardSource, /\bhideStandaloneLinks\b/);
  assert.match(guestAuth, /to="\/auth\/login"[\s\S]*?Open full login page/);
  assert.match(guestAuth, /to="\/auth\/signup"[\s\S]*?Open full signup page/);
});

test('dedicated auth routes retain their existing Scrolith Human Verification flow', () => {
  assert.match(app, /path="\/auth\/login"[\s\S]*?<Login\s*\/>/);
  assert.match(app, /path="\/auth\/signup"[\s\S]*?<Signup\s*\/>/);
  assert.match(login, /<ScrolithHumanVerification[\s\S]*?endpoint="login"/);
  assert.match(signup, /<ScrolithHumanVerification[\s\S]*?endpoint="signup"/);
});

test('embedded guest login and signup require and forward Scrolith Human Verification', () => {
  assert.match(guestAuth, /const \[loginHvRequired, setLoginHvRequired\] = React\.useState\(true\)/);
  assert.match(guestAuth, /const \[signupHvRequired, setSignupHvRequired\] = React\.useState\(true\)/);
  assert.match(guestAuth, /if \(loginHvRequired && !loginHvToken\)/);
  assert.match(guestAuth, /if \(signupHvRequired && !signupHvToken\)/);
  assert.match(guestAuth, /disabled=\{loginLoading \|\| \(loginHvRequired && !loginHvToken\)\}/);
  assert.match(guestAuth, /disabled=\{signupLoading \|\| \(signupHvRequired && !signupHvToken\)\}/);
  assert.match(guestAuth, /endpoint="login"[\s\S]*?onVerified=\{setLoginHvToken\}[\s\S]*?onRequiredChange=\{setLoginHvRequired\}/);
  assert.match(guestAuth, /endpoint="signup"[\s\S]*?onVerified=\{setSignupHvToken\}[\s\S]*?onRequiredChange=\{setSignupHvRequired\}/);
  assert.match(guestAuth, /humanVerificationToken: loginHvToken \|\| undefined/);
  assert.match(guestAuth, /recaptchaToken,[\s\S]*?signupHvToken/);
  assert.match(userContext, /humanVerificationToken: options\?\.humanVerificationToken/);
});

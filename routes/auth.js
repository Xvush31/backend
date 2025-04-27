import React, { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import Logo from "@/components/Logo";
import { GoogleLogin } from '@react-oauth/google';
import AppleLogin from 'react-apple-login';
import { useAuth } from "../contexts/AuthContext";

const Login: React.FC = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [rememberMe, setRememberMe] = useState(false);
  const navigate = useNavigate();
  const { login } = useAuth();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    try {
      const response = await fetch('https://backend-puce-rho-15.vercel.app/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      const data = await response.json();
      if (response.ok) {
        login(data.token, data.role); // Passe le rôle au contexte
        if (rememberMe) {
          localStorage.setItem('token', data.token);
          localStorage.setItem('role', data.role);
        }
        navigate(data.role === 'creator' ? '/creator-dashboard' : '/');
      } else {
        setError(data.error || 'Email ou mot de passe incorrect');
      }
    } catch (error) {
      setError('Erreur réseau. Veuillez réessayer.');
      console.error('Erreur réseau:', error);
    }
  };

  const handleGoogleSuccess = async (response: any) => {
    try {
      const res = await fetch('https://backend-puce-rho-15.vercel.app/api/auth/google', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: response.credential }),
      });
      const data = await res.json();
      if (res.ok) {
        login(data.token, data.role);
        if (rememberMe) {
          localStorage.setItem('token', data.token);
          localStorage.setItem('role', data.role);
        }
        navigate(data.role === 'creator' ? '/creator-dashboard' : '/');
      } else {
        setError('Erreur lors de la connexion avec Google');
      }
    } catch (error) {
      setError('Erreur réseau');
      console.error('Erreur réseau:', error);
    }
  };

  const handleGoogleFailure = () => {
    setError('Échec de la connexion avec Google');
  };

  const handleAppleResponse = async (response: any) => {
    try {
      const res = await fetch('https://backend-puce-rho-15.vercel.app/api/auth/apple', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(response),
      });
      const data = await res.json();
      if (res.ok) {
        login(data.token, data.role);
        if (rememberMe) {
          localStorage.setItem('token', data.token);
          localStorage.setItem('role', data.role);
        }
        navigate(data.role === 'creator' ? '/creator-dashboard' : '/');
      } else {
        setError('Erreur lors de la connexion avec Apple');
      }
    } catch (error) {
      setError('Erreur réseau');
      console.error('Erreur réseau:', error);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="w-full max-w-md space-y-8">
        <div className="text-center">
          <div className="flex justify-center mb-4">
            <Logo />
          </div>
          <h1 className="text-2xl font-bold">Connectez-vous à votre compte</h1>
          <p className="text-muted-foreground mt-2">
            Bienvenue. Veuillez vous connecter pour continuer.
          </p>
        </div>

        <div className="bg-card rounded-lg shadow-lg p-6 border border-border">
          {error && <p className="text-red-500 text-center mb-4">{error}</p>}
          <form className="space-y-6" onSubmit={handleLogin}>
            <div className="space-y-2">
              <label htmlFor="email" className="text-sm font-medium">Email</label>
              <Input
                id="email"
                type="email"
                placeholder="votre@email.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label htmlFor="password" className="text-sm font-medium">Mot de passe</label>
                <Link to="/forgot-password" className="text-xs text-brand-accent hover:underline">
                  Mot de passe oublié ?
                </Link>
              </div>
              <Input
                id="password"
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>

            <div className="flex items-center">
              <Checkbox
                id="remember"
                checked={rememberMe}
                onCheckedChange={(checked: boolean) => setRememberMe(checked)}
              />
              <label htmlFor="remember" className="ml-2 text-sm">
                Se souvenir de moi
              </label>
            </div>

            <Button type="submit" className="w-full">
              Se connecter
            </Button>
          </form>

          <div className="relative my-6">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-muted"></div>
            </div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-card px-2 text-muted-foreground">ou</span>
            </div>
          </div>

          <div className="space-y-3">
            <GoogleLogin
              onSuccess={handleGoogleSuccess}
              onError={handleGoogleFailure}
              buttonText="Continuer avec Google"
              width="100%"
            />
            <AppleLogin
              clientId="com.xvush.signin"
              redirectURI="https://xvush.com/auth/apple/callback"
              onSuccess={handleAppleResponse}
              onFailure={(error: any) => setError('Échec de la connexion avec Apple')}
              render={(renderProps: any) => (
                <Button variant="outline" className="w-full" onClick={renderProps.onClick}>
                  Continuer avec Apple
                </Button>
              )}
            />
          </div>
        </div>

        <p className="text-center text-sm text-muted-foreground">
          Pas encore de compte ?{" "}
          <Link to="/signup" className="font-medium text-brand-accent hover:underline">
            Inscrivez-vous
          </Link>
        </p>
      </div>
    </div>
  );
};

export default Login;
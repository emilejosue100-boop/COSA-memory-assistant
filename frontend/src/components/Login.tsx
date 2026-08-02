import React, { useEffect, useState } from 'react';

import { Language, GlobalState } from '../types';

import { apiGet, apiPost, setToken } from '../lib/api';

import { getUserMessage, getApiConfigWarning } from '../lib/userMessages';

import UserNotice from './UserNotice';

import { Shield, Smartphone, Globe, Landmark, User, Users } from 'lucide-react';



type LoginTab = 'signin' | 'join' | 'committee';



interface LoginResponse {

  success: boolean;

  token?: string;

  state: GlobalState;

  error?: string;

}



interface AuthStatus {

  hasAdmin: boolean;

}



interface LoginProps {

  language: Language;

  onLanguageChange: (lang: Language) => void;

  onLoginSuccess: (updatedState: GlobalState) => void;

  bootstrapNotice?: string | null;

}



export default function Login({

  language,

  onLanguageChange,

  onLoginSuccess,

  bootstrapNotice,

}: LoginProps) {

  const [displayLanguage, setDisplayLanguage] = useState<Language>(language);

  const [tab, setTab] = useState<LoginTab>('signin');

  const [committeeSetup, setCommitteeSetup] = useState(false);

  const [hasAdmin, setHasAdmin] = useState(true);

  const [name, setName] = useState('');

  const [phone, setPhone] = useState('');

  const [pin, setPin] = useState('');

  const [loading, setLoading] = useState(false);

  const [error, setError] = useState<string | null>(null);



  useEffect(() => {

    setDisplayLanguage(language);

  }, [language]);



  useEffect(() => {

    apiGet<AuthStatus>('/api/auth/status', false, displayLanguage, 'general').then(({ ok, data }) => {

      if (ok) {

        setHasAdmin(data.hasAdmin);

      }

    });

  }, [displayLanguage]);



  const handleLanguageSelect = (lang: Language) => {

    setDisplayLanguage(lang);

    onLanguageChange(lang);

  };



  const resetForm = () => {

    setError(null);

    setName('');

    setPhone('');

    setPin('');

  };



  const switchTab = (next: LoginTab) => {

    setTab(next);

    setCommitteeSetup(false);

    resetForm();

  };



  const handleSubmit = async (e: React.FormEvent) => {

    e.preventDefault();

    if (!phone || !pin) {

      setError(displayLanguage === 'en' ? 'Please fill in phone and PIN' : 'Veuillez renseigner le téléphone et le code PIN');

      return;

    }



    if ((tab === 'join' || committeeSetup) && !name.trim()) {

      setError(displayLanguage === 'en' ? 'Please enter your full name' : 'Veuillez saisir votre nom complet');

      return;

    }



    setLoading(true);

    setError(null);



    try {

      if (tab === 'committee' && !committeeSetup) {

        const { ok, data, error } = await apiPost<LoginResponse>(

          '/api/login/admin',

          { phone, pin },

          false,

          displayLanguage,

          'committee'

        );

        if (ok && data.token) {

          setToken(data.token);

          onLoginSuccess(data.state);

        } else {

          setError(error || data.error || null);

        }

      } else {

        const mode = tab === 'join' || committeeSetup ? 'register' : 'login';

        const { ok, data, error } = await apiPost<LoginResponse>(

          '/api/login',

          { phone, pin, name: name.trim() || undefined, mode },

          false,

          displayLanguage,

          mode === 'register' ? 'register' : 'login'

        );

        if (ok && data.token) {

          setToken(data.token);

          onLoginSuccess(data.state);

        } else {

          setError(error || data.error || null);

        }

      }

    } catch {

      setError(getUserMessage({ language: displayLanguage, code: 'network', context: 'login' }));

    } finally {

      setLoading(false);

    }

  };



  const tabs: { id: LoginTab; labelEn: string; labelFr: string }[] = [

    { id: 'signin', labelEn: 'Sign In', labelFr: 'Connexion' },

    { id: 'join', labelEn: 'Join', labelFr: 'Inscription' },

    { id: 'committee', labelEn: 'Committee', labelFr: 'Comité' },

  ];



  const helperText = () => {

    if (tab === 'signin') {

      return displayLanguage === 'en'

        ? 'Use the phone number and PIN your committee registered for you.'

        : 'Utilisez le numéro de téléphone et le code PIN enregistrés par votre comité.';

    }

    if (tab === 'join') {

      return displayLanguage === 'en'

        ? 'Create a member account for your cooperative. Your committee must approve your membership.'

        : 'Créez un compte membre pour votre coopérative. Votre comité doit approuver votre adhésion.';

    }

    if (committeeSetup) {

      return displayLanguage === 'en'

        ? 'First-time committee setup. Use the ADMIN_PHONE configured on the server.'

        : 'Configuration initiale du comité. Utilisez le ADMIN_PHONE configuré sur le serveur.';

    }

    return displayLanguage === 'en'

      ? 'For registered committee members only.'

      : 'Réservé aux membres du comité enregistrés.';

  };



  const submitLabel = () => {

    if (loading) return null;

    if (tab === 'signin') return displayLanguage === 'en' ? 'Sign In' : 'Connexion';

    if (tab === 'join') return displayLanguage === 'en' ? 'Create Account' : 'Créer un compte';

    if (committeeSetup) return displayLanguage === 'en' ? 'Set Up Committee' : 'Configurer le comité';

    return displayLanguage === 'en' ? 'Committee Sign In' : 'Connexion comité';

  };



  const showNameField = tab === 'join' || committeeSetup;

  const configWarning = getApiConfigWarning(displayLanguage);



  return (

    <div className="min-h-screen w-full bg-background flex flex-col items-center justify-center p-4">

      <div className="mb-6 flex flex-col items-center text-center">

        <div className="w-16 h-16 bg-primary text-white rounded-2xl flex items-center justify-center shadow-subtle mb-3">

          <Landmark size={32} className="stroke-[1.5]" />

        </div>

        <h1 className="text-3xl font-bold text-oil-black font-display tracking-tight flex items-center gap-1">

          Kumbuka

        </h1>

        <p className="text-sm text-text-secondary mt-1 max-w-xs px-2">

          {displayLanguage === 'en'

            ? 'Your cooperative savings platform, digitized with trust.'

            : 'Votre plateforme d\'épargne coopérative, numérisée avec confiance.'}

        </p>

      </div>



      <div className="w-full max-w-md bg-white border border-border-subtle rounded-xl p-6 md:p-8 shadow-subtle">

        <div className="flex justify-between items-center mb-6 pb-4 border-b border-border-subtle">

          <span className="text-xs font-semibold text-text-secondary flex items-center gap-1.5 uppercase tracking-wider">

            <Globe size={14} />

            {displayLanguage === 'en' ? 'Select Language' : 'Choisir la langue'}

          </span>

          <div className="flex bg-background rounded-full p-1 border border-border-subtle">

            <button

              type="button"

              onClick={() => handleLanguageSelect('en')}

              className={`px-3 py-1 text-xs font-medium rounded-full transition-all ${

                displayLanguage === 'en' ? 'bg-primary text-white' : 'text-text-secondary hover:text-oil-black'

              }`}

            >

              EN

            </button>

            <button

              type="button"

              onClick={() => handleLanguageSelect('fr')}

              className={`px-3 py-1 text-xs font-medium rounded-full transition-all ${

                displayLanguage === 'fr' ? 'bg-primary text-white' : 'text-text-secondary hover:text-oil-black'

              }`}

            >

              FR

            </button>

          </div>

        </div>



        <div className="flex gap-1 mb-6 bg-background rounded-xl p-1 border border-border-subtle">

          {tabs.map((t) => (

            <button

              key={t.id}

              type="button"

              onClick={() => switchTab(t.id)}

              className={`flex-1 py-2 text-xs font-semibold rounded-lg transition-all ${

                tab === t.id

                  ? t.id === 'committee'

                    ? 'bg-accent text-white shadow-subtle'

                    : 'bg-primary text-white shadow-subtle'

                  : 'text-text-secondary hover:text-oil-black'

              }`}

            >

              {displayLanguage === 'en' ? t.labelEn : t.labelFr}

            </button>

          ))}

        </div>



        {tab === 'committee' && !committeeSetup && (

          <div className="mb-4 flex items-start gap-2 p-3 bg-accent/10 border border-accent/20 rounded-xl">

            <Users size={16} className="text-accent mt-0.5 shrink-0" />

            <p className="text-[11px] text-oil-black leading-relaxed">

              {displayLanguage === 'en'

                ? 'Committee access only. Members should use Sign In or Join.'

                : 'Accès comité uniquement. Les membres doivent utiliser Connexion ou Inscription.'}

            </p>

          </div>

        )}



        {tab === 'signin' && (

          <div className="mb-4 p-3 bg-background border border-border-subtle rounded-xl">

            <p className="text-[11px] text-text-secondary leading-relaxed">

              {displayLanguage === 'en'

                ? 'Demo member: 0788111111 / PIN 1234'

                : 'Membre démo : 0788111111 / PIN 1234'}

            </p>

          </div>

        )}



        {tab === 'committee' && !committeeSetup && (

          <div className="mb-4 p-3 bg-background border border-border-subtle rounded-xl">

            <p className="text-[11px] text-text-secondary leading-relaxed">

              {displayLanguage === 'en'

                ? 'Demo admin: 0788123456 / PIN 1234'

                : 'Comité démo : 0788123456 / PIN 1234'}

            </p>

          </div>

        )}



        {(error || bootstrapNotice || configWarning) && (

          <UserNotice

            message={error || bootstrapNotice || configWarning || ''}

            variant={error || bootstrapNotice ? 'error' : 'warning'}

          />

        )}



        <form onSubmit={handleSubmit} className="space-y-4">

          {showNameField && (

            <div>

              <label className="block text-xs font-semibold text-oil-black mb-1.5 uppercase tracking-wider">

                {displayLanguage === 'en' ? 'Full Name' : 'Nom complet'}

              </label>

              <div className="relative">

                <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-text-secondary">

                  <User size={18} />

                </span>

                <input

                  type="text"

                  required

                  placeholder={displayLanguage === 'en' ? 'e.g. Marie Chantal' : 'ex. Marie Chantal'}

                  value={name}

                  onChange={(e) => setName(e.target.value)}

                  className="w-full h-12 pl-10 pr-4 bg-background border border-border-subtle rounded-xl text-sm focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary font-sans transition-all placeholder:text-gray-400"

                />

              </div>

            </div>

          )}



          <div>

            <label className="block text-xs font-semibold text-oil-black mb-1.5 uppercase tracking-wider">

              {displayLanguage === 'en' ? 'Phone Number' : 'Numéro de téléphone'}

            </label>

            <div className="relative">

              <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-text-secondary">

                <Smartphone size={18} />

              </span>

              <input

                type="text"

                required

                placeholder="e.g. 0788123456"

                value={phone}

                onChange={(e) => setPhone(e.target.value)}

                className="w-full h-12 pl-10 pr-4 bg-background border border-border-subtle rounded-xl text-sm focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary font-sans transition-all placeholder:text-gray-400"

              />

            </div>

          </div>



          <div>

            <label className="block text-xs font-semibold text-oil-black mb-1.5 uppercase tracking-wider">

              {displayLanguage === 'en' ? 'Security PIN (4 digits)' : 'Code PIN (4 chiffres)'}

            </label>

            <div className="relative">

              <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-text-secondary">

                <Shield size={18} />

              </span>

              <input

                type="password"

                required

                maxLength={4}

                placeholder="••••"

                value={pin}

                onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}

                className="w-full h-12 pl-10 pr-4 bg-background border border-border-subtle rounded-xl text-sm tracking-widest focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary font-sans transition-all placeholder:text-gray-400"

              />

            </div>

          </div>



          <button

            type="submit"

            disabled={loading}

            className={`w-full h-12 font-semibold rounded-xl shadow-subtle active:scale-[0.98] transition-all flex items-center justify-center text-sm text-white ${

              tab === 'committee'

                ? 'bg-accent hover:bg-accent/90 disabled:bg-accent/75'

                : 'bg-primary hover:bg-primary-hover disabled:bg-primary/75'

            }`}

          >

            {loading ? (

              <span className="inline-block border-2 border-white border-t-transparent w-5 h-5 rounded-full animate-spin" />

            ) : (

              submitLabel()

            )}

          </button>

        </form>



        {tab === 'committee' && !hasAdmin && !committeeSetup && (

          <button

            type="button"

            onClick={() => {

              setCommitteeSetup(true);

              resetForm();

            }}

            className="mt-4 w-full text-center text-xs font-semibold text-accent hover:underline"

          >

            {displayLanguage === 'en' ? 'First-time committee setup' : 'Configuration initiale du comité'}

          </button>

        )}



        {tab === 'committee' && committeeSetup && (

          <button

            type="button"

            onClick={() => {

              setCommitteeSetup(false);

              resetForm();

            }}

            className="mt-4 w-full text-center text-xs font-medium text-text-secondary hover:text-oil-black"

          >

            {displayLanguage === 'en' ? 'Back to committee sign in' : 'Retour à la connexion comité'}

          </button>

        )}



        <p className="mt-6 text-center text-[11px] text-text-secondary leading-relaxed">

          {helperText()}

        </p>

      </div>

    </div>

  );

}



import React, { useState, useRef } from 'react';
import { GlobalState, Language } from '../types';
import { apiGet, apiPost, clearToken } from '../lib/api';
import { formatCurrency } from '../lib/currency';
import { useCurrency } from '../hooks/useCurrency';
import UserNotice from './UserNotice';
import { LogOut, Globe, Camera, Upload, Heart, Moon, Sun, User, Coins } from 'lucide-react';

interface ProfileSettingsProps {
  state: GlobalState;
  language: Language;
  onLanguageChange: (lang: Language) => void;
  onStateChange: (updated: GlobalState) => void;
  onLogout: () => void;
  darkMode: boolean;
  onToggleDarkMode: (val: boolean) => void;
}

export default function ProfileSettings({
  state, 
  language, 
  onLanguageChange, 
  onStateChange, 
  onLogout,
  darkMode,
  onToggleDarkMode
}: ProfileSettingsProps) {
  const { currentUser } = state;
  const { currency, cdfRate } = useCurrency();
  const [loading, setLoading] = useState(false);
  const [exchangeRateInput, setExchangeRateInput] = useState('');
  const [exchangeRateSaving, setExchangeRateSaving] = useState(false);
  const [exchangeRateSuccess, setExchangeRateSuccess] = useState('');
  const [exchangeRateError, setExchangeRateError] = useState<string | null>(null);
  const [showImageOptions, setShowImageOptions] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    if (currentUser?.role === 'admin' && state.exchangeRates?.CDF) {
      setExchangeRateInput(String(state.exchangeRates.CDF));
    }
  }, [currentUser?.role, state.exchangeRates?.CDF]);

  const handleSaveExchangeRate = async (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = Number(exchangeRateInput);
    if (!exchangeRateInput || Number.isNaN(parsed) || parsed <= 0) {
      setExchangeRateError(
        language === 'en'
          ? 'Enter a positive number for the CDF rate.'
          : 'Entrez un nombre positif pour le taux CDF.'
      );
      return;
    }

    setExchangeRateSaving(true);
    setExchangeRateError(null);
    setExchangeRateSuccess('');
    try {
      const { ok, error } = await apiPost(
        '/api/exchange-rates',
        { currency: 'CDF', rate: parsed },
        true,
        language
      );
      if (!ok) {
        setExchangeRateError(error || null);
        return;
      }

      const { ok: stateOk, data } = await apiGet<GlobalState>('/api/state', true, language);
      if (stateOk) {
        onStateChange(data);
      }

      setExchangeRateSuccess(
        language === 'en' ? 'Exchange rate updated.' : 'Taux de change mis à jour.'
      );
      setTimeout(() => setExchangeRateSuccess(''), 3000);
    } catch {
      setExchangeRateError(null);
    } finally {
      setExchangeRateSaving(false);
    }
  };

  const handleLogoutClick = async () => {
    setLoading(true);
    try {
      const { ok } = await apiPost('/api/logout');
      if (ok) {
        clearToken();
        onLogout();
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 2 * 1024 * 1024) {
      setUploadError(language === 'en' ? 'Image must be less than 2MB.' : 'L\'image doit faire moins de 2 Mo.');
      return;
    }

    const reader = new FileReader();
    reader.onloadend = async () => {
      const base64String = reader.result as string;
      setLoading(true);
      setUploadError(null);
      try {
        const { ok, data, error } = await apiPost<GlobalState>(
          '/api/update-profile-image',
          { profileImage: base64String },
          true,
          language,
          'profile'
        );
        if (ok) {
          onStateChange(data);
          setShowImageOptions(false);
        } else {
          setUploadError(error || null);
        }
      } catch {
        setUploadError(null);
      } finally {
        setLoading(false);
      }
    };
    reader.readAsDataURL(file);
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h2 className="text-xl font-bold font-display text-oil-black tracking-tight">
          {language === 'en' ? 'Profile & Configuration' : 'Profil et configuration'}
        </h2>
        <p className="text-xs text-text-secondary">
          {language === 'en' ? 'Configure preferences and customize your profile' : 'Configurez vos préférences et personnalisez votre profil'}
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-12 gap-6">
        {/* Left Side: Avatar Card */}
        <div className="md:col-span-5 bg-surface border border-border-subtle rounded-xl p-6 shadow-subtle flex flex-col items-center text-center relative overflow-hidden">
          <div className="relative group">
            <img
              src={currentUser?.profileImage}
              alt={currentUser?.name}
              className="w-24 h-24 rounded-full object-cover border-2 border-primary shadow-subtle mb-4 transition-transform duration-300 group-hover:scale-105"
            />
            <button
              onClick={() => setShowImageOptions(!showImageOptions)}
              className="absolute bottom-4 right-0 bg-primary hover:bg-primary-hover text-white p-2 rounded-full shadow-subtle border-2 border-surface transition-all flex items-center justify-center cursor-pointer"
              title={language === 'en' ? "Change Profile Photo" : "Changer la photo"}
            >
              <Camera size={14} className="flex-shrink-0" />
            </button>
          </div>

          <h3 className="text-lg font-bold font-display text-oil-black">{currentUser?.name}</h3>
          <p className="text-xs text-text-secondary font-semibold mt-0.5">{currentUser?.phone}</p>
          
          <div className="mt-4 px-4 py-1.5 bg-primary/10 text-primary border border-primary/20 rounded-full text-[10px] font-bold uppercase tracking-wider flex items-center justify-center gap-1.5">
            <User size={12} className="flex-shrink-0" />
            <span>
              {currentUser?.role === 'admin' 
                ? (language === 'en' ? 'Committee Member' : 'Membre du comité') 
                : (language === 'en' ? 'Saving Member' : 'Membre épargnant')}
            </span>
          </div>

          {/* Change Image Panel */}
          {showImageOptions && (
            <div className="w-full mt-6 p-4 bg-background border border-border-subtle rounded-xl animate-fade-in space-y-4">
              <div className="flex justify-between items-center">
                <span className="text-xs font-bold text-oil-black">
                  {language === 'en' ? 'Upload Profile Photo' : 'Télécharger une photo'}
                </span>
                <button 
                  onClick={() => setShowImageOptions(false)}
                  className="text-[10px] text-text-secondary hover:text-oil-black font-bold uppercase"
                >
                  {language === 'en' ? 'Close' : 'Fermer'}
                </button>
              </div>

              {uploadError && <UserNotice message={uploadError} />}

              <div className="pt-2">
                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={handleFileChange}
                  accept="image/*"
                  className="hidden"
                />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={loading}
                  className="w-full h-11 border-2 border-dashed border-border-subtle hover:border-primary rounded-xl text-xs font-semibold text-text-secondary hover:text-oil-black transition-all flex items-center justify-center gap-2 cursor-pointer bg-surface"
                >
                  <Upload size={14} className="flex-shrink-0" />
                  <span>{language === 'en' ? 'Upload Custom Photo' : 'Télécharger une photo'}</span>
                </button>
              </div>
            </div>
          )}

          <div className="w-full border-t border-border-subtle/50 my-6"></div>

          <div className="w-full text-left space-y-3.5">
            <div className="flex justify-between text-xs font-semibold">
              <span className="text-text-secondary">{language === 'en' ? 'Cooperative' : 'Coopérative'}:</span>
              <span className="text-oil-black truncate max-w-[180px] text-right">{currentUser?.cooperativeName}</span>
            </div>
            <div className="flex justify-between text-xs font-semibold">
              <span className="text-text-secondary">{language === 'en' ? 'Join Date' : 'Date d\'adhésion'}:</span>
              <span className="text-oil-black">{currentUser?.joinDate}</span>
            </div>
            <div className="flex justify-between text-xs font-semibold">
              <span className="text-text-secondary">{language === 'en' ? 'Personal Balance' : 'Solde personnel'}:</span>
              <span className="text-emerald-700">
                {formatCurrency(currentUser?.savingsBalance || 0, currency, cdfRate)}
              </span>
            </div>
          </div>
        </div>

        {/* Right Side: Options & Role Switchers */}
        <div className="md:col-span-7 space-y-6">
          {currentUser?.role === 'admin' && (
            <div className="bg-surface border border-border-subtle rounded-xl p-6 shadow-subtle space-y-4">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 bg-accent/10 text-accent rounded-xl flex items-center justify-center flex-shrink-0">
                  <Coins size={18} className="flex-shrink-0" />
                </div>
                <div>
                  <h4 className="text-sm font-bold text-oil-black">
                    {language === 'en' ? 'Exchange Rate (USD → CDF)' : 'Taux de change (USD → CDF)'}
                  </h4>
                  <p className="text-[11px] text-text-secondary">
                    {language === 'en'
                      ? 'Set the cooperative display rate used across the app.'
                      : 'Définissez le taux d\'affichage utilisé dans toute l\'application.'}
                  </p>
                </div>
              </div>

              <form onSubmit={handleSaveExchangeRate} className="space-y-3">
                <label className="block text-xs font-semibold text-text-secondary">
                  {language === 'en' ? 'CDF per 1 USD' : 'CDF pour 1 USD'}
                </label>
                <input
                  type="number"
                  min="0"
                  step="any"
                  value={exchangeRateInput}
                  onChange={(e) => setExchangeRateInput(e.target.value)}
                  className="w-full h-11 px-4 rounded-xl border border-border-subtle bg-background text-sm font-semibold text-oil-black focus:outline-none focus:ring-2 focus:ring-primary/20"
                  disabled={exchangeRateSaving}
                />
                {state.exchangeRates?.updatedAt && (
                  <p className="text-[11px] text-text-secondary">
                    {language === 'en' ? 'Last updated' : 'Dernière mise à jour'}:{' '}
                    {new Date(state.exchangeRates.updatedAt).toLocaleString()}{' '}
                    {state.exchangeRates.updatedBy ? `by ${state.exchangeRates.updatedBy}` : ''}
                  </p>
                )}
                {exchangeRateError && <UserNotice message={exchangeRateError} />}
                {exchangeRateSuccess && (
                  <p className="text-xs font-semibold text-emerald-700">{exchangeRateSuccess}</p>
                )}
                <button
                  type="submit"
                  disabled={exchangeRateSaving}
                  className="h-11 px-5 rounded-xl bg-primary hover:bg-primary-hover text-white text-xs font-bold transition-all disabled:opacity-60"
                >
                  {exchangeRateSaving
                    ? language === 'en'
                      ? 'Saving...'
                      : 'Enregistrement...'
                    : language === 'en'
                      ? 'Save Rate'
                      : 'Enregistrer le taux'}
                </button>
              </form>
            </div>
          )}

          {/* Settings Box */}
          <div className="bg-surface border border-border-subtle rounded-xl p-6 shadow-subtle space-y-6">
            
            {/* Language Selector */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 bg-primary/10 text-primary rounded-xl flex items-center justify-center flex-shrink-0">
                  <Globe size={18} className="flex-shrink-0" />
                </div>
                <div>
                  <h4 className="text-sm font-bold text-oil-black">
                    {language === 'en' ? 'System Language' : 'Langue du système'}
                  </h4>
                  <p className="text-[11px] text-text-secondary">
                    {language === 'en' ? 'Translate app content' : 'Traduire le contenu de l\'application'}
                  </p>
                </div>
              </div>

              <div className="flex bg-background border border-border-subtle rounded-full p-1 self-start sm:self-auto">
                <button
                  onClick={() => onLanguageChange('en')}
                  className={`px-4 py-1.5 text-xs font-bold rounded-full transition-all cursor-pointer ${
                    language === 'en' ? 'bg-primary text-white shadow-subtle' : 'text-text-secondary'
                  }`}
                >
                  English
                </button>
                <button
                  onClick={() => onLanguageChange('fr')}
                  className={`px-4 py-1.5 text-xs font-bold rounded-full transition-all cursor-pointer ${
                    language === 'fr' ? 'bg-primary text-white shadow-subtle' : 'text-text-secondary'
                  }`}
                >
                  Français
                </button>
              </div>
            </div>

            <div className="border-t border-border-subtle/50 my-4"></div>

            {/* Dark Mode Toggle */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 bg-primary/10 text-primary rounded-xl flex items-center justify-center flex-shrink-0">
                  {darkMode ? <Moon size={18} className="flex-shrink-0" /> : <Sun size={18} className="flex-shrink-0" />}
                </div>
                <div>
                  <h4 className="text-sm font-bold text-oil-black">
                    {language === 'en' ? 'Dark Mode' : 'Mode sombre'}
                  </h4>
                  <p className="text-[11px] text-text-secondary">
                    {language === 'en' ? 'Toggle light and dark appearance' : 'Basculer entre l\'apparence claire et sombre'}
                  </p>
                </div>
              </div>

              <button
                onClick={() => onToggleDarkMode(!darkMode)}
                className={`w-12 h-6 rounded-full p-1 transition-colors relative flex items-center cursor-pointer ${
                  darkMode ? 'bg-primary' : 'bg-neutral-200'
                }`}
              >
                <div
                  className={`w-4 h-4 bg-white rounded-full shadow-subtle transition-transform flex-shrink-0 ${
                    darkMode ? 'translate-x-6' : 'translate-x-0'
                  }`}
                />
              </button>
            </div>

            <div className="border-t border-border-subtle/50 my-4"></div>

            {/* Sign Out Trigger */}
            <button
              onClick={handleLogoutClick}
              disabled={loading}
              className="w-full h-14 md:h-11 border border-red-200 hover:bg-red-50 text-error font-bold rounded-xl text-xs flex items-center justify-center gap-2 transition-all cursor-pointer"
            >
              <LogOut size={16} className="flex-shrink-0" />
              <span>{language === 'en' ? 'Sign Out' : 'Déconnexion'}</span>
            </button>
          </div>

          {/* Slogan Brand Signature */}
          <div className="p-4 bg-background border border-border-subtle rounded-xl flex items-center gap-3 justify-center">
            <Heart size={14} className="text-red-500 fill-red-500 animate-pulse flex-shrink-0" />
            <p className="text-[11px] text-text-secondary font-semibold">
              {language === 'en' ? 'Rooted in community savings traditions' : "Ancré dans les traditions d'épargne communautaire"}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

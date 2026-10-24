"use client";

import React, { useEffect, useState, useRef } from "react";
import Link from "next/link";
import { User, LogOut, LogIn, ChevronDown } from "lucide-react";
import { getCurrentSession, signOutUser, AuthSession } from "@/lib/firebase/authService";

export default function UserNav() {
  const [session, setSession] = useState<AuthSession | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setSession(getCurrentSession());

    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  if (!session) {
    return (
      <Link
        href="/login"
        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-blue-700 bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded-xl transition-colors"
      >
        <LogIn className="w-3.5 h-3.5" />
        <span>Sign In</span>
      </Link>
    );
  }

  const displayName = session.name || session.email.split("@")[0];
  const initial = (displayName.charAt(0) || "U").toUpperCase();

  return (
    <div className="relative" ref={menuRef}>
      <button
        onClick={() => setMenuOpen(!menuOpen)}
        className="inline-flex items-center gap-2 px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:text-slate-900 bg-slate-100 hover:bg-slate-200/80 rounded-xl transition-all cursor-pointer border border-slate-200"
      >
        <div className="w-5 h-5 rounded-full bg-blue-600 text-white flex items-center justify-center text-[10px] font-bold">
          {initial}
        </div>
        <span className="max-w-[120px] truncate">{displayName}</span>
        <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
      </button>

      {menuOpen && (
        <div className="absolute right-0 mt-2 w-56 bg-white border border-slate-200 rounded-2xl shadow-xl p-2 z-50">
          <div className="px-3 py-2 border-b border-slate-100 mb-1">
            <p className="text-xs font-semibold text-slate-800 truncate">{displayName}</p>
            <p className="text-[11px] text-slate-500 truncate">{session.email}</p>
          </div>

          <button
            onClick={() => signOutUser()}
            className="w-full flex items-center gap-2 px-3 py-2 text-xs text-rose-600 hover:bg-rose-50 rounded-xl font-medium transition-colors cursor-pointer text-left"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span>Sign Out</span>
          </button>
        </div>
      )}
    </div>
  );
}

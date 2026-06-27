/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
import { Player, ChatMessage } from '../types';
import { Send, MessageCircle, Lock, X, Globe, User } from 'lucide-react';

interface ChatBoxProps {
  players: Player[];
  selfPlayerId: string;
  selfPlayerTeam?: 'A' | 'B';
  messages: ChatMessage[];
  activeChatTab: 'public' | 'team' | string;
  openedPrivateChats: string[];
  onSelectTab: (tabId: 'public' | 'team' | string) => void;
  onClosePrivateTab: (partnerId: string) => void;
  onSendMessage: (text: string, recipientId?: string, isTeamChat?: boolean, team?: 'A' | 'B') => void;
  unreadChatPlayerIds?: string[];
}

export default function ChatBox({
  players,
  selfPlayerId,
  selfPlayerTeam,
  messages,
  activeChatTab,
  openedPrivateChats,
  onSelectTab,
  onClosePrivateTab,
  onSendMessage,
  unreadChatPlayerIds = [],
}: ChatBoxProps) {
  const [inputText, setInputText] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Filter messages for current tab
  const activeMessages = messages.filter((msg) => {
    if (activeChatTab === 'public') {
      return !msg.recipientId && !msg.isTeamChat;
    } else if (activeChatTab === 'team') {
      return msg.isTeamChat && msg.team === selfPlayerTeam;
    } else {
      // Private chat with partner (activeChatTab is the partner's playerId)
      return (
        (msg.senderId === selfPlayerId && msg.recipientId === activeChatTab) ||
        (msg.senderId === activeChatTab && msg.recipientId === selfPlayerId)
      );
    }
  });

  // Scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [activeMessages.length, activeChatTab]);

  const handleSend = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputText.trim()) return;
    
    let recipientId: string | undefined;
    let isTeamChat = false;
    let team: 'A' | 'B' | undefined;

    if (activeChatTab === 'public') {
        recipientId = undefined;
    } else if (activeChatTab === 'team') {
        isTeamChat = true;
        team = selfPlayerTeam;
    } else {
        recipientId = activeChatTab;
    }
    onSendMessage(inputText.trim(), recipientId, isTeamChat, team);
    setInputText('');
  };

  const getPlayerName = (id: string) => {
    if (id === selfPlayerId) return 'أنت (You)';
    const p = players.find((pl) => pl.id === id);
    return p ? p.name : 'لاعب غادر';
  };

  const getPlayerColorClass = (id: string) => {
    const p = players.find((pl) => pl.id === id);
    return p ? p.color : 'bg-slate-700 text-slate-300';
  };

  return (
    <div id="game-chat-box" className="w-full bg-slate-950/75 border border-slate-800/80 rounded-2xl overflow-hidden shadow-2xl flex flex-col h-[320px] transition-all duration-300">
      
      {/* Tabs list */}
      <div className="flex items-center gap-1 bg-slate-900/60 p-2 border-b border-slate-850 overflow-x-auto scrollbar-none select-none">
        {/* Public tab */}
        <button
          id="chat-tab-public"
          onClick={() => onSelectTab('public')}
          className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
            activeChatTab === 'public'
              ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/40 border border-transparent'
          }`}
        >
          <Globe className="w-3.5 h-3.5" />
          <span>الدردشة العامة (الجميع)</span>
        </button>

        {/* Team tab */}
        {selfPlayerTeam && (
        <button
          id="chat-tab-team"
          onClick={() => onSelectTab('team')}
          className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
            activeChatTab === 'team'
              ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/40 border border-transparent'
          }`}
        >
          <User className="w-3.5 h-3.5" />
          <span>فريق {selfPlayerTeam} 🤝</span>
        </button>
        )}

        {/* Private tabs */}
        {openedPrivateChats.map((partnerId) => {
          const partner = players.find((p) => p.id === partnerId);
          if (!partner) return null;
          const isSelected = activeChatTab === partnerId;
          const hasUnread = unreadChatPlayerIds.includes(partnerId);

          return (
            <div key={partnerId} className="relative flex items-center">
              <button
                id={`chat-tab-private-${partnerId}`}
                onClick={() => onSelectTab(partnerId)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                  isSelected
                    ? 'bg-red-500/10 text-red-400 border border-red-500/20'
                    : hasUnread
                    ? 'bg-red-500/10 text-red-400 border border-red-500/30 animate-pulse'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/40 border border-transparent'
                }`}
              >
                <Lock className="w-3 h-3 text-red-500/80" />
                <span className={`w-2 h-2 rounded-full ${partner.color} flex-shrink-0`} />
                <span>دردشة خاصة: {partner.name}</span>
                {hasUnread && (
                  <span className="w-1.5 h-1.5 bg-red-500 rounded-full animate-ping" />
                )}
              </button>
              
              <button
                id={`close-chat-tab-${partnerId}`}
                onClick={(e) => {
                  e.stopPropagation();
                  onClosePrivateTab(partnerId);
                }}
                className="p-1 text-slate-500 hover:text-red-400 transition-colors cursor-pointer"
                title="إغلاق المحادثة الخاصة"
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          );
        })}
      </div>

      {/* Messages area */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3 flex flex-col text-right">
        {activeMessages.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center text-slate-500 gap-1.5 select-none">
            <MessageCircle className="w-8 h-8 text-slate-600 animate-bounce" />
            <span className="text-xs font-medium">لا توجد رسائل في هذه القناة بعد...</span>
            <span className="text-[10px] text-slate-600">كن أول من يكتب رسالة! 💬</span>
          </div>
        ) : (
          activeMessages.map((msg) => {
            const isSelf = msg.senderId === selfPlayerId;
            return (
              <div
                key={msg.id}
                className={`flex flex-col max-w-[85%] ${
                  isSelf ? 'self-start mr-auto items-start' : 'self-end ml-auto items-end'
                }`}
              >
                {/* Sender Tag */}
                <div className="flex items-center gap-1 mb-1 text-[9.5px] font-bold text-slate-500">
                  {!isSelf && (
                    <span className={`w-1.5 h-1.5 rounded-full ${getPlayerColorClass(msg.senderId)}`} />
                  )}
                  <span>{getPlayerName(msg.senderId)}</span>
                </div>

                {/* Message bubble */}
                <div
                  className={`px-3 py-2 rounded-2xl text-xs break-all text-right shadow-sm border ${
                    isSelf
                      ? 'bg-slate-900 border-slate-800 text-slate-200 rounded-tl-none'
                      : activeChatTab === 'public'
                      ? 'bg-amber-950/20 border-amber-900/10 text-amber-200 rounded-tr-none'
                      : 'bg-red-950/25 border-red-900/15 text-red-200 rounded-tr-none'
                  }`}
                >
                  <p className="leading-relaxed whitespace-pre-wrap">{msg.text}</p>
                </div>
              </div>
            );
          })
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Form input */}
      <form onSubmit={handleSend} className="p-3 bg-slate-950/80 border-t border-slate-900 flex items-center gap-2">
        <button
          type="submit"
          className="bg-amber-500 hover:bg-amber-400 text-slate-950 p-2 rounded-xl transition duration-150 shrink-0 cursor-pointer shadow-md disabled:opacity-50"
          disabled={!inputText.trim()}
          title="إرسال / Send"
        >
          <Send className="w-4 h-4 transform rotate-180" />
        </button>
        <input
          id="chat-message-input"
          type="text"
          value={inputText}
          onChange={(e) => setInputText(e.target.value)}
          placeholder={
            activeChatTab === 'public'
              ? 'اكتب رسالة عامة للجميع...'
              : activeChatTab === 'team'
              ? 'اكتب رسالة لفريقك...'
              : 'اكتب رسالة خاصة سرية...'
          }
          maxLength={200}
          className="flex-1 bg-slate-900 border border-slate-800 hover:border-slate-700 focus:border-amber-500 focus:ring-1 focus:ring-amber-500/20 rounded-xl px-4 py-2 text-xs text-right text-slate-200 outline-none transition placeholder-slate-600 font-medium"
          autoComplete="off"
        />
      </form>

    </div>
  );
}

/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { COLOR_METADATA } from '../gameUtils';
import { HelpCircle, ChevronRight, Play, BookOpen, Star, Sparkles, AlertCircle } from 'lucide-react';

interface HowToPlayProps {
  onDismiss?: () => void;
  fullWidth?: boolean;
}

export default function HowToPlay({ onDismiss, fullWidth = false }: HowToPlayProps) {
  const [activeTab, setActiveTab] = useState<'concept' | 'rules' | 'scoring' | 'strategies'>('concept');

  const tabs = [
    { id: 'concept', label: 'فكرة اللعبة ومكوناتها', icon: BookOpen },
    { id: 'rules', label: 'طريقة اللعب والقفز', icon: Play },
    { id: 'scoring', label: 'كيف تفوز؟ (المجموعات)', icon: Star },
    { id: 'strategies', label: 'أسرار واستراتيجيات 🧠', icon: Sparkles },
  ] as const;

  return (
    <div id="how-to-play-container" className={`bg-slate-900 border border-slate-800 rounded-3xl p-6 text-white text-right font-sans shadow-2xl relative overflow-hidden ${fullWidth ? 'w-full' : 'max-w-2xl mx-auto'}`}>
      <div id="tutorial-accent" className="absolute top-0 right-0 w-32 h-32 bg-amber-500/10 rounded-full blur-3xl opacity-50 pointer-events-none" />
      <div id="tutorial-accent-2" className="absolute bottom-0 left-0 w-32 h-32 bg-purple-500/10 rounded-full blur-3xl opacity-50 pointer-events-none" />

      {/* Header */}
      <div id="tutorial-header" className="flex items-center justify-between border-b border-slate-800 pb-4 mb-6">
        {onDismiss && (
          <button
            id="dismiss-tutorial-btn"
            onClick={onDismiss}
            className="text-xs bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold px-4 py-2 rounded-xl transition duration-150 flex items-center gap-1.5 cursor-pointer"
          >
            <ChevronRight className="w-4 h-4" />
            <span>ابدأ اللعب الآن</span>
          </button>
        )}
        <div id="tutorial-title-area" className="flex items-center gap-3">
          <div>
            <h2 className="text-xl font-extrabold text-amber-400 tracking-tight">دليل لعبة Skippity بالتفصيل</h2>
            <p className="text-xs text-slate-400 font-medium mt-0.5">من تعلّم الأساسيات إلى احتراف اللعب (2 - 4 لاعبين)</p>
          </div>
          <div className="bg-amber-500/10 p-2.5 rounded-2xl border border-amber-500/20 text-amber-400">
            <HelpCircle className="w-5 h-5" />
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div id="tutorial-tabs" className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-6">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              id={`tab-${tab.id}`}
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center justify-center gap-2 py-3 px-2 rounded-2xl text-xs font-bold transition duration-200 border cursor-pointer ${
                isActive
                  ? 'bg-amber-500 border-amber-500 text-slate-950 shadow-lg shadow-amber-500/10'
                  : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-white hover:border-slate-700'
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* Tab Content */}
      <div id="tutorial-content" className="bg-slate-950/50 border border-slate-800/80 rounded-2xl p-5 min-h-[220px] transition-all duration-300">
        
        {/* CONCEPT */}
        {activeTab === 'concept' && (
          <div id="concept-tab-content" className="space-y-4 animate-fade-in">
            <div id="concept-idea">
              <h3 className="text-sm font-extrabold text-amber-400 mb-2 flex items-center justify-start gap-2">
                <span>💡 فكرة اللعبة الأساسية</span>
              </h3>
              <p className="text-slate-300 text-sm leading-relaxed">
                Skippity هي لعبة ذكاء وتخطيط ممتعة، <strong className="text-white">وليس لكل لاعب لون خاص بها</strong>. جميع اللاعبين يستخدمون ويتحركون بكل القطع الموجودة على اللوح دون استثناء! الهدف هو تحريك القطع بالقفز لتجمع أكبر عدد ممكن من مجموعات الألوان المختلفة أمامك.
              </p>
            </div>

            <div id="concept-components" className="border-t border-slate-800 pt-3">
              <h3 className="text-sm font-extrabold text-slate-200 mb-2">⚙️ مكونات وتجهيز اللعبة:</h3>
              <ul className="text-slate-300 text-sm space-y-2 list-none">
                <li className="flex items-start gap-2 justify-start">
                  <span className="text-amber-500 mt-1">•</span>
                  <span><strong className="text-white">شبكة لوح 10×10 مربع:</strong> تحتوي على خانات اللعب.</span>
                </li>
                <li className="flex items-start gap-2 justify-start">
                  <span className="text-amber-500 mt-1">•</span>
                  <span><strong className="text-white">القطع الملونة الغنية (Skippers):</strong> 5 ألوان مميزة: الأحمر {COLOR_METADATA.red.dot}، الأزرق {COLOR_METADATA.blue.dot}، الأخضر {COLOR_METADATA.green.dot}، الأصفر {COLOR_METADATA.yellow.dot}، والبنفسجي {COLOR_METADATA.purple.dot}.</span>
                </li>
                <li className="flex items-start gap-2 justify-start">
                  <span className="text-amber-500 mt-1">•</span>
                  <span><strong className="text-white">التجهيز الأصلي:</strong> توضع القطع عشوائياً في جميع المربعات، <strong className="text-amber-400">وتُترك الخانات الأربعة في منتصف اللوح فارغة تمامًا</strong> لتبدأ منها حركات القفز المتتالية.</span>
                </li>
              </ul>
            </div>
          </div>
        )}

        {/* RULES */}
        {activeTab === 'rules' && (
          <div id="rules-tab-content" className="space-y-4">
            <h3 className="text-sm font-extrabold text-amber-400 mb-1">🎮 في دورك، تقوم بالخطوات التالية:</h3>
            
            <div id="rule-step-1" className="bg-slate-900/80 p-3 rounded-xl border border-slate-800">
              <p className="text-sm text-slate-300">
                <strong className="text-amber-400">1. اختر أي قطعة:</strong> حدد أي قطعة بأي لون وفي أي مكان على اللوح للبدء بتحريكها.
              </p>
            </div>

            <div id="rule-step-2" className="bg-slate-900/80 p-3 rounded-xl border border-slate-800">
              <p className="text-sm text-slate-300">
                <strong className="text-amber-400">2. القفز والأسر:</strong> القفز يكون في خط مستقيم فقط: للأعلى ⬆️، للأسفل ⬇️، لليمين ➡️، أو لليسار ⬅️. (ممنوع قطرياً 🚫).
              </p>
              <div id="rule-jump-condition" className="mt-2 text-xs text-slate-400 flex items-center gap-2 bg-slate-950 p-2 rounded-lg justify-end">
                <span>يجب أن تقفز فوق <strong className="text-white">قطعة واحدة فقط</strong> وتهبط في <strong className="text-white">مربع فارغ مباشرة بعدها</strong>.</span>
                <span className="text-emerald-400 font-bold">شرط أساسي:</span>
              </div>
              <div id="rule-jump-example" className="mt-2 text-xs bg-amber-500/5 border border-amber-500/10 p-2 rounded-lg text-amber-200">
                <span>📌 مثال: {COLOR_METADATA.red.dot} {COLOR_METADATA.blue.dot} ⬜ ➔ الأحمر يقفز فوق الأزرق، فيأسر الأزرق ويأخذه، ويهبط في المربع الفارغ.</span>
              </div>
            </div>

            <div id="rule-step-3" className="bg-slate-900/80 p-3 rounded-xl border border-slate-800">
              <p className="text-sm text-slate-300">
                <strong className="text-amber-400">3. القفزات المتتالية:</strong> إذا أتيح لك بعد الهبوط فرصة قفز جديدة بنفس القطعة، يمكنك المتابعة وأسر المزيد في نفس الدور! يمكنك التوقف في أي وقت أو الاستمرار حتى تنتهي الخيارات.
              </p>
            </div>

            <div id="rule-step-4" className="bg-slate-900/80 p-3 rounded-xl border border-slate-800">
              <p className="text-sm text-slate-300">
                <strong className="text-amber-400">4. إنهاء الدور:</strong> بعد إتمام قفزتك أو سلسلة القفزات، ينتهي دورك تلقائياً إذا رغبت أو إذا لم يعد هناك قفزات متاحة لتلك القطعة.
              </p>
            </div>
          </div>
        )}

        {/* SCORING */}
        {activeTab === 'scoring' && (
          <div id="scoring-tab-content" className="space-y-4">
            <div>
              <h3 className="text-sm font-extrabold text-amber-400 mb-2">🏆 كيف يُحدد الفائز؟</h3>
              <p className="text-slate-300 text-sm leading-relaxed">
                لا يفوز من يملك قطعاً أكثر بالمجمل، بل <strong className="text-white">من يستطيع تكوين أكبر عدد من المجموعات الكاملة الألوان</strong>!
              </p>
            </div>

            <div id="scoring-example" className="bg-slate-900/80 p-4 rounded-xl border border-slate-800 space-y-3">
              <p className="text-xs text-slate-400 font-bold">🌈 تشتمل "المجموعة الكاملة" على قطعة واحدة من كل لون من الألوان الخمسة:</p>
              <div id="scoring-colors-row" className="flex justify-center gap-3 bg-slate-950 p-2.5 rounded-xl border border-slate-800/80">
                {Object.entries(COLOR_METADATA).map(([key, meta]) => (
                  <div id={`score-meta-${key}`} key={key} className="flex flex-col items-center gap-1">
                    <span className="text-lg">{meta.dot}</span>
                    <span className="text-[10px] text-slate-400">{meta.name}</span>
                  </div>
                ))}
              </div>
              <p className="text-sm text-slate-200 leading-relaxed text-right">
                💡 <strong className="text-amber-400">مثال توضيحي:</strong> إذا كان لديك: <br/>
                - ٣ قطع حمراء، ٢ زرقاء، ١ خضراء، ١ صفراء، ١ بنفسجية. <br/>
                فأنت تملك <strong className="text-emerald-400 font-bold">مجموعة كاملة واحدة فقط</strong>، لأن اللون الأقل لديك هو الأخضر والأصفر والبنفسجي (قطعة واحدة فقط لكل منها). باقي القطع الحمراء والزرقاء الزائدة لا تشكل مجموعات كاملة حتى تعزز الألوان الأخرى الناقصة!
              </p>
            </div>

            <div id="scoring-ending" className="text-xs text-slate-400 bg-slate-900/50 p-3 rounded-lg text-right">
              🕒 <strong className="text-white">نهاية اللعبة:</strong> تنتهي المباراة عندما لا يتبقى باللوح أي فرصة قفز ممكنة قانونياً، أو عندما يُفرغ اللوح تماماً من القطع.
            </div>
          </div>
        )}

        {/* STRATEGIES */}
        {activeTab === 'strategies' && (
          <div id="strategies-tab-content" className="space-y-3">
            <h3 className="text-sm font-extrabold text-amber-400 mb-2">💡 استراتيجيات احترافية للفوز 🧠:</h3>
            
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div id="strategy-1" className="bg-slate-900/60 p-3 rounded-xl border border-slate-800">
                <span className="text-xs text-slate-400 block mb-1">الموازنة الذكية ⚖️</span>
                <p className="text-xs text-slate-200">
                  لا تركض خلف أي قطعة تراها. حاول دائماً موازنة أرقام ألوانك والتركيز على اللون الأقل لديك لتكوين نقاط مجموعات جديدة.
                </p>
              </div>

              <div id="strategy-2" className="bg-slate-900/60 p-3 rounded-xl border border-slate-800">
                <span className="text-xs text-slate-400 block mb-1">قطع الطريق 🚫</span>
                <p className="text-xs text-slate-200">
                  راقب تجميعات خصومك جيداً! إذا كان خصمك يحتاج قطعة بنفسجية بشدة لإكمال مجموعة ثانية، حاول خطفها ومنعه من الوصول إليها.
                </p>
              </div>

              <div id="strategy-3" className="bg-slate-900/60 p-3 rounded-xl border border-slate-800">
                <span className="text-xs text-slate-400 block mb-1">الحركات التكتيكية 🔄</span>
                <p className="text-xs text-slate-200">
                  أحياناً قد يكون من الذكاء تحريك قطعة لا تحتاجها، فقط لتغيير ملامح اللوح وحرمان خصمك من قفزة خماسية مدمرة!
                </p>
              </div>

              <div id="strategy-4" className="bg-slate-900/60 p-3 rounded-xl border border-slate-800">
                <span className="text-xs text-slate-400 block mb-1">التخطيط المتتالي ⛓️</span>
                <p className="text-xs text-slate-200">
                  خطط بدقة لسلسلة القفزات قبل البدء، حيث يمكن لقفزة واحدة مدروسة أن تفتح لك قفزات متكاملة هائلة أو تغلقها عليك!
                </p>
              </div>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}

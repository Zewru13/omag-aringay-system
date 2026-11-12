import { useState } from "react";
import { Link } from "react-router-dom";
import { Info, BookOpen, HelpCircle, ChevronDown } from "lucide-react";
import PageLayout from "../../components/Layout/PageLayout.jsx";
import { SYSTEM_TITLE } from "../../constants/appInfo.js";
import { useAuth } from "../../context/AuthContext.jsx";
import { ROLE_LABELS, helpFor } from "./helpContent.js";

function FaqItem({ question, answer }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="border-b border-[#F0F4F0] last:border-0">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center justify-between w-full py-3.5 text-left hover:text-[#1B4D2E] transition-colors"
      >
        <span className="text-[13px] font-medium text-[#1A2B1A] pr-4">
          {question}
        </span>
        <ChevronDown
          className={`w-4 h-4 text-[#A8BCA8] flex-shrink-0 transition-transform duration-200 ${
            open ? "rotate-180" : "rotate-0"
          }`}
        />
      </button>
      {open && (
        <div className="pb-3.5">
          <p className="text-[13px] text-[#4A5E4A] leading-relaxed">{answer}</p>
        </div>
      )}
    </div>
  );
}

function HelpPage() {
  const { isAdmin } = useAuth();
  const role = isAdmin ? "ADMIN" : "EVALUATOR";
  const { steps, sections } = helpFor(role);
  return (
    <PageLayout
      title="Help"
      subtitle={`Quick guide and frequently asked questions for the ${ROLE_LABELS[role]} account`}
    >
      <p className="mb-4 rounded-xl border border-[#E2E8E2] bg-white px-4 py-3 text-[13px] text-[#4A5E4A]">
        Looking for a picture of a screen with every button explained?{" "}
        <Link to="/manual" className="font-semibold text-[#1B4D2E] hover:underline">Open the User Manual</Link>.
      </p>
      {/* About This System */}
      <div className="bg-white rounded-xl border border-[#E2E8E2] shadow-[0_1px_3px_rgba(0,0,0,0.04)] p-6 mb-4">
        <div className="flex items-center gap-3 mb-5 pb-4 border-b border-[#F0F4F0]">
          <div className="w-9 h-9 rounded-[10px] bg-[#EBF5EE] flex items-center justify-center flex-shrink-0">
            <Info className="w-4 h-4 text-[#1B4D2E]" />
          </div>
          <div>
            <h2 className="text-[14px] font-semibold text-[#1A2B1A]">
              About This System
            </h2>
            <p className="text-[12px] text-[#7A8E7A]">
              System information and overview
            </p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="bg-[#F9FAF9] rounded-lg p-4 border border-[#E2E8E2]">
            <p className="text-[10px] font-semibold text-[#A8BCA8] uppercase tracking-[0.08em] mb-2">
              System Name
            </p>
            <p className="text-[13px] font-medium text-[#1A2B1A]">{SYSTEM_TITLE}</p>
          </div>
          <div className="bg-[#F9FAF9] rounded-lg p-4 border border-[#E2E8E2]">
            <p className="text-[10px] font-semibold text-[#A8BCA8] uppercase tracking-[0.08em] mb-2">
              Office
            </p>
            <p className="text-[13px] font-medium text-[#1A2B1A]">
              Office of the Municipal Agriculturist (OMAg)
            </p>
            <p className="text-[12px] text-[#7A8E7A] mt-0.5">
              Aringay, La Union
            </p>
          </div>
          <div className="bg-[#F9FAF9] rounded-lg p-4 border border-[#E2E8E2]">
            <p className="text-[10px] font-semibold text-[#A8BCA8] uppercase tracking-[0.08em] mb-2">
              Coverage
            </p>
            <p className="text-[13px] font-medium text-[#1A2B1A]">
              24 Barangays of Aringay
            </p>
            <p className="text-[12px] text-[#7A8E7A] mt-0.5">
              La Union, Region I
            </p>
          </div>
          <div className="bg-[#F9FAF9] rounded-lg p-4 border border-[#E2E8E2]">
            <p className="text-[10px] font-semibold text-[#A8BCA8] uppercase tracking-[0.08em] mb-2">
              System Developed By
            </p>
            <p className="text-[13px] font-medium text-[#1A2B1A]">
              John Michael E. Marzan And Jhaoquin Carl B. Inong
            </p>
            <p className="text-[12px] text-[#7A8E7A] mt-0.5">
              Saint Louis College
            </p>
          </div>
        </div>
      </div>

      {/* Quick Guide */}
      <div className="bg-white rounded-xl border border-[#E2E8E2] shadow-[0_1px_3px_rgba(0,0,0,0.04)] p-6 mb-4">
        <div className="flex items-center gap-3 mb-5 pb-4 border-b border-[#F0F4F0]">
          <div className="w-9 h-9 rounded-[10px] bg-[#EBF5EE] flex items-center justify-center flex-shrink-0">
            <BookOpen className="w-4 h-4 text-[#1B4D2E]" />
          </div>
          <div>
            <h2 className="text-[14px] font-semibold text-[#1A2B1A]">
              Quick Guide
            </h2>
            <p className="text-[12px] text-[#7A8E7A]">
              How to use the main features
            </p>
          </div>
        </div>

        <div className="space-y-2">
          {steps.map((item) => (
            <div
              key={item.step}
              className="flex items-start gap-3 p-3 rounded-lg hover:bg-[#F9FAF9] transition-colors"
            >
              <div className="w-7 h-7 rounded-full bg-[#1B4D2E] text-white text-[11px] font-bold flex items-center justify-center flex-shrink-0">
                {item.step}
              </div>
              <div>
                <p className="text-[13px] font-semibold text-[#1A2B1A]">
                  {item.title}
                </p>
                <p className="text-[12px] text-[#7A8E7A] mt-0.5 leading-relaxed">
                  {item.desc}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* FAQ */}
      <div className="bg-white rounded-xl border border-[#E2E8E2] shadow-[0_1px_3px_rgba(0,0,0,0.04)] p-6">
        <div className="flex items-center gap-3 mb-5 pb-4 border-b border-[#F0F4F0]">
          <div className="w-9 h-9 rounded-[10px] bg-[#EBF5EE] flex items-center justify-center flex-shrink-0">
            <HelpCircle className="w-4 h-4 text-[#1B4D2E]" />
          </div>
          <div>
            <h2 className="text-[14px] font-semibold text-[#1A2B1A]">
              Frequently Asked Questions
            </h2>
            <p className="text-[12px] text-[#7A8E7A]">
              Common questions and answers
            </p>
          </div>
        </div>

        <div className="space-y-6">
          {sections.map((section) => (
            <section key={section.title} aria-label={section.title}>
              <h3 className="mb-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-[#7A8E7A]">{section.title}</h3>
              <div>
                {section.items.map((faq) => (
                  <FaqItem key={faq.q} question={faq.q} answer={faq.a} />
                ))}
              </div>
            </section>
          ))}
        </div>
      </div>
    </PageLayout>
  );
}

export default HelpPage;

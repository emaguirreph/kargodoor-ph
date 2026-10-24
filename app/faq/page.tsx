"use client";

import { useEffect, useRef, useState } from "react";
import { PageHero, SiteShell } from "@/components/v5/chrome";
import { MessengerLink } from "@/components/messenger-link";
import { faqs } from "@/lib/faq-content";

const number = (index: number) => String(index + 1).padStart(2, "0");

export default function FaqPage() {
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState(0);
  const [narrow, setNarrow] = useState(false);
  const textRefs = useRef<Array<HTMLDivElement | null>>([]);
  const [answerText, setAnswerText] = useState<string[]>([]);

  // Search matches the question and the answer text.
  useEffect(() => {
    const timer = window.setTimeout(() => {
      setAnswerText(textRefs.current.map((el) => el?.textContent?.toLowerCase() ?? ""));
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    const media = window.matchMedia("(max-width: 900px)");
    const update = () => setNarrow(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);

  const q = query.trim().toLowerCase();
  const rows = faqs
    .map((faq, index) => ({ faq, index }))
    .filter(({ faq, index }) => !q || `${faq.question} ${answerText[index] ?? ""}`.toLowerCase().includes(q));
  const current = rows.some((row) => row.index === selected) ? selected : rows[0]?.index ?? -1;

  return (
    <SiteShell>
      <PageHero>
        <h1 id="faq-title">FREQUENTLY ASKED QUESTIONS</h1>
        <p className="lead">
          Everything you need to know about shipping with KargoDoor PH.
        </p>
        <label className="fsearch">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="m20 20-4-4" /></svg>
          <input type="search" aria-label="Search the questions" value={query} onChange={(event) => setQuery(event.target.value)} />
        </label>
      </PageHero>

      <section className="band" style={{ paddingTop: 30 }} aria-labelledby="faq-title">
        <div className="wrap">
          {rows.length > 0 ? (
            <div className="fpane">
              <div className="fnav" role="tablist" aria-label="Questions">
                {rows.map(({ faq, index }) => {
                  const open = index === current;
                  return (
                    <div key={faq.question}>
                      <button
                        type="button"
                        className="fq"
                        role="tab"
                        id={`faq-tab-${index}`}
                        aria-selected={open}
                        aria-controls={narrow ? `faq-inline-${index}` : "faq-detail"}
                        onClick={() => setSelected(narrow && open ? -1 : index)}
                      >
                        <span className="n">{number(index)}</span>
                        <span>{faq.question}</span>
                        <span className="chev" aria-hidden="true">›</span>
                      </button>
                      {open && narrow && (
                        <div className="fin" id={`faq-inline-${index}`}>
                          <div className="ans">{faq.answer}</div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
              {current >= 0 && (
                <article className="fdetail" id="faq-detail" role="tabpanel" aria-labelledby={`faq-tab-${current}`} aria-live="polite">
                  <span className="pill">{number(current)} / {faqs.length}</span>
                  <h2 className="h3">{faqs[current].question}</h2>
                  <div className="ans" key={current}>{faqs[current].answer}</div>
                </article>
              )}
            </div>
          ) : (
            <div className="fempty">—</div>
          )}

          <div hidden>
            {faqs.map((faq, index) => (
              <div key={faq.question} ref={(el) => { textRefs.current[index] = el; }}>{faq.answer}</div>
            ))}
          </div>

          <div className="cta" style={{ marginTop: 60 }}>
            <h2 style={{ fontSize: "clamp(1.5rem,3vw,2.2rem)" }}>Need more information about shipping with KargoDoor PH?</h2>
            <p>Find answers to our most common questions, or contact our team if you need help with your shipment.</p>
            <MessengerLink className="btn btn-green glow" target="_blank" rel="noopener noreferrer" analyticsEvent="generate_lead">
              GET A QUOTE <span className="arr">→</span>
            </MessengerLink>
          </div>
        </div>
      </section>
    </SiteShell>
  );
}

// Interview conversation flow, independent of the UI so it can be unit tested.
// The UI supplies an `io` adapter: say(text, meta) and getAnswer(meta).
import { scoreAnswer } from './score.js';
import { mulberry32 } from './select.js';

export const RULES = Object.freeze({
  nudgeBelowCoverage: 0.4,   // weak answer -> interviewer asks to elaborate once
  deepAtCoverage: 0.75,      // strong answer -> deeper follow-up question
  maxDeepFollowUps: 2,       // per interview
});

const ACKS = ['Thank you.', 'Okay, got it.', 'Alright, thanks.', 'Understood.', 'Okay.', 'Thanks for that.'];
const NEXT = ['Let’s move on.', 'Next question.', 'Moving on.', 'Here’s the next one.', 'Let’s continue.'];

export function greetingLine({ interviewer, candidateName, position, count }) {
  const who = candidateName ? `Hi ${candidateName}` : 'Hi there';
  return `${who}, I’m ${interviewer.name.split(' ')[0]}, ${interviewer.title.toLowerCase()} on the hiring panel. Thanks for joining. This is ${[8, 11, 18].includes(count) || String(count).startsWith('8') ? 'an' : 'a'} ${count}-question interview for the ${position} role. Take your time and think out loud — when you’ve finished an answer, tap “Done”. Let’s begin.`;
}

export function nudgeLine(result) {
  const miss = result.missed[0];
  const hint = miss ? miss.label.split(/[–:(]/)[0].trim().toLowerCase() : '';
  return hint
    ? `Could you elaborate a little more? For example, what about ${hint}?`
    : 'Could you elaborate a little more on that?';
}

export function closingLine(candidateName) {
  return `That’s all the questions I have${candidateName ? ', ' + candidateName : ''}. Thank you for your time — your detailed feedback is ready on the next screen.`;
}

export function transitionLine(rand, { skipped, isLast }) {
  if (skipped) return isLast ? 'No problem.' : 'No problem, let’s move to the next one.';
  const ack = ACKS[Math.floor(rand() * ACKS.length)];
  if (isLast) return ack;
  return `${ack} ${NEXT[Math.floor(rand() * NEXT.length)]}`;
}

export class InterviewSession {
  /**
   * @param {object} p
   * @param {Array} p.questions
   * @param {object} p.config {interviewer, candidateName, position, followUps:boolean, seed}
   * @param {object} p.io {say(text, meta):Promise, getAnswer(meta):Promise<{text,durationSec,action}>, onProgress?(state)}
   */
  constructor({ questions, config, io }) {
    this.questions = questions;
    this.config = config;
    this.io = io;
    this.items = [];
    this.ended = false;
    this.rand = mulberry32((config.seed || 1) + 7);
    this.deepUsed = 0;
  }

  end() { this.ended = true; }

  progress(extra) {
    this.io.onProgress && this.io.onProgress({ index: this.items.length, total: this.questions.length, ...extra });
  }

  async run() {
    const { io, config } = this;
    await io.say(greetingLine({ ...config, count: this.questions.length }), { kind: 'greeting' });

    for (let i = 0; i < this.questions.length && !this.ended; i++) {
      const q = this.questions[i];
      const isLast = i === this.questions.length - 1;
      this.progress({ index: i, question: q, phase: 'asking' });
      const prefix = i === 0 ? '' : (isLast && this.questions.length > 2 ? 'Last question. ' : '');
      await io.say(prefix + q.q, { kind: 'question', question: q, index: i });
      if (this.ended) break;

      this.progress({ index: i, question: q, phase: 'answering' });
      const a = await io.getAnswer({ kind: 'answer', question: q, index: i });
      if (a.action === 'end') { this.ended = true; if (!a.text) break; }

      const item = { questionId: q.id, question: q, answer: a.text || '', durationSec: a.durationSec || 0, skipped: a.action === 'skip', result: null, nudge: null, followUp: null };
      if (item.skipped) {
        item.result = scoreAnswer(q, '');
      } else {
        item.result = scoreAnswer(q, item.answer, { durationSec: item.durationSec });

        if (config.followUps && !this.ended && !item.result.flags.empty && !item.result.flags.dontKnow
            && item.result.coverage < RULES.nudgeBelowCoverage) {
          const prompt = nudgeLine(item.result);
          await io.say(prompt, { kind: 'nudge', question: q, index: i });
          const b = await io.getAnswer({ kind: 'nudge', question: q, index: i });
          if (b.action === 'end') this.ended = true;
          item.nudge = { prompt, answer: b.text || '' };
          if (b.text) {
            const combined = `${item.answer} ${b.text}`;
            item.durationSec += b.durationSec || 0;
            item.result = scoreAnswer(q, combined, { durationSec: item.durationSec });
          }
        } else if (config.followUps && !this.ended && q.followUp && item.result.coverage >= RULES.deepAtCoverage
                   && this.deepUsed < RULES.maxDeepFollowUps && !isLast) {
          this.deepUsed++;
          const prompt = `Good. A quick follow-up: ${q.followUp}`;
          await io.say(prompt, { kind: 'followup', question: q, index: i });
          const b = await io.getAnswer({ kind: 'followup', question: q, index: i });
          if (b.action === 'end') this.ended = true;
          item.followUp = { prompt: q.followUp, answer: b.text || '' };
        }
      }
      this.items.push(item);
      this.progress({ index: i + 1, phase: 'scored', item });
      if (!this.ended) await io.say(transitionLine(this.rand, { skipped: item.skipped, isLast }), { kind: 'transition' });
    }

    if (!this.ended || this.items.length) {
      await io.say(closingLine(config.candidateName), { kind: 'closing' });
    }
    return { items: this.items, endedEarly: this.items.length < this.questions.length };
  }
}

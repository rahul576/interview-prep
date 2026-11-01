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

export function prepGreetingLine({ interviewer, candidateName, count, audioChecked, timeLimitMin }) {
  const hello = `${audioChecked ? 'Perfect' : candidateName ? `Hi ${candidateName}` : 'Hi'}, I\u2019m ${interviewer.name.split(' ')[0]}.`;
  const length = timeLimitMin
    ? `This is a ${timeLimitMin >= 60 ? 'one hour' : `${timeLimitMin} minute`} preparation session. I\u2019ll keep asking questions until our time is up.`
    : `This is a preparation session with ${count} question${count === 1 ? '' : 's'}. There is no time limit.`;
  return `${hello} ${length} After each answer you will get feedback and the model answer, and you can try again as often as you like.`;
}

/** Said when a time-limited preparation session runs out of time. */
export function timeUpLine() {
  return 'That\u2019s our time for this session.';
}

/** Spoken summary of the feedback card after a preparation answer (read at a brisk pace). */
export function feedbackSpeech(item, { passScore = 60 } = {}) {
  const r = item.result;
  if (item.skipped) return 'You skipped this one. Have a look at the model answer, and try it again when you are ready.';
  const verdict = r.overall >= passScore ? 'Good answer' : 'This needs work';
  const parts = [`You scored ${r.overall} out of 100. ${verdict}. Technical ${r.technical}, communication ${r.communication}.`];
  if (r.matched.length) parts.push(`You covered ${listText(r.matched.map(m => m.label))}.`);
  if (r.missed.length) parts.push(`To improve, also cover ${listText(r.missed.map(m => m.label))}.`);
  const tips = (r.tips || []).filter(t => !/^Also cover/i.test(t)).slice(0, 2);
  if (tips.length) parts.push(tips.join(' '));
  if (r.overall < passScore) parts.push('Read the model answer, then press Try again.');
  return parts.join(' ').replace(/\s+/g, ' ');
}

function listText(items) {
  const xs = items.map(x => x.replace(/\s*\/\s*/g, ' or ').toLowerCase());
  if (xs.length <= 1) return xs.join('');
  return `${xs.slice(0, -1).join('; ')}; and ${xs.at(-1)}`;
}

/** First thing the interviewer says, before anything else: a two-way audio check. */
export function hearingCheckLine({ interviewer, candidateName }) {
  return `Hi${candidateName ? ' ' + candidateName : ''}, this is ${interviewer.name.split(' ')[0]}. Can you hear me okay?`;
}

export function greetingLine({ interviewer, candidateName, position, count, audioChecked }) {
  const who = audioChecked ? 'Perfect' : (candidateName ? `Hi ${candidateName}` : 'Hi there');
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
    const { io } = this;
    let { config } = this;
    const prep = config.mode === 'prep';
    // Like a real call: confirm both sides can hear each other before starting.
    if (io.audioCheck) {
      const check = await io.audioCheck();
      if (check === 'end') { this.ended = true; return { items: [], endedEarly: true, audioCheck: check }; }
      this.audioCheck = check;
      config = { ...config, audioChecked: true };
    }
    await io.say((prep ? prepGreetingLine : greetingLine)({ ...config, count: this.questions.length }), { kind: 'greeting' });
    if (io.onStarted) io.onStarted();

    const timeUp = () => !!(io.timeUp && io.timeUp());
    for (let i = 0; i < this.questions.length && !this.ended; i++) {
      if (i > 0 && timeUp()) { this.outOfTime = true; await io.say(timeUpLine(), { kind: 'transition', score: 0 }); break; }
      const q = this.questions[i];
      let isLast = i === this.questions.length - 1;
      this.progress({ index: i, question: q, phase: 'asking' });
      const prefix = i === 0 ? '' : (isLast && this.questions.length > 2 ? 'Last question. ' : '');
      await io.say(prefix + q.q, { kind: 'question', question: q, index: i });
      if (this.ended) break;

      this.progress({ index: i, question: q, phase: 'answering' });
      const a = await io.getAnswer({ kind: 'answer', question: q, index: i });
      if (a.action === 'end') { this.ended = true; if (!a.text) break; }

      const item = { questionId: q.id, question: q, answer: a.text || '', durationSec: a.durationSec || 0, skipped: a.action === 'skip', result: null, nudge: null, followUp: null, attempts: 1, hintUsed: !!a.hintUsed, interrupted: !!a.interrupted };
      if (prep) {
        // Preparation mode: instant feedback, unlimited retries, no follow-up probing.
        item.result = scoreAnswer(q, item.skipped ? '' : item.answer, { durationSec: item.durationSec });
        item.firstScore = item.result.overall;
        while (!this.ended) {
          const choice = io.review ? await io.review(item, { index: i, isLast: isLast || timeUp() }) : 'next';
          if (choice === 'end') { this.ended = true; break; }
          if (choice !== 'retry') break;
          const b = await io.getAnswer({ kind: 'retry', question: q, index: i });
          if (b.action === 'end') { this.ended = true; if (!b.text) break; }
          if (b.action === 'skip') continue;
          item.attempts++;
          item.skipped = false;
          item.answer = b.text || '';
          item.durationSec = b.durationSec || 0;
          item.hintUsed = item.hintUsed || !!b.hintUsed;
          item.interrupted = item.interrupted || !!b.interrupted;
          item.result = scoreAnswer(q, item.answer, { durationSec: item.durationSec });
        }
      } else if (item.skipped) {
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
      if (!this.ended && !prep) await io.say(transitionLine(this.rand, { skipped: item.skipped, isLast }), { kind: 'transition', score: item.result.overall });
    }

    if (!this.ended || this.items.length) {
      await io.say(closingLine(config.candidateName), { kind: 'closing' });
    }
    return { items: this.items, endedEarly: !this.outOfTime && this.items.length < this.questions.length, outOfTime: !!this.outOfTime };
  }
}

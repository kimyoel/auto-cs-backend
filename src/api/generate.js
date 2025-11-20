// /src/api/generate.js

import express from 'express';
import OpenAI from 'openai';

const router = express.Router();

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// In-memory usage counter: key = usage:${clientId}:${YYYY-MM-DD} -> count
const usageCounter = new Map();

function todayStr() {
  return new Date().toISOString().split('T')[0];
}

// ---- 메인 핸들러 ----
async function generateHandler(req, res) {
  try {
    const { licenseKey, tone, clipboardText, clientId, scenario } = req.body || {};

    const toneValue = tone || 'friendly';
    const scenarioValue = scenario || 'general';
    const text = (clipboardText || '').toString().trim();

    // ===== 1. 라이선스 / 일일 사용량 체크 =====
    const isPro = licenseKey === 'GOOD_SELLER_2025';
    const limit = isPro ? 999 : 5;
    const key = `usage:${clientId || 'anon'}:${todayStr()}`;
    const used = usageCounter.get(key) || 0;

    if (!isPro && used >= limit) {
      // 무료 유저: 하루 5회 초과 시 LLM 호출 없이 바로 차단
      return res.status(200).json({
        ok: false,
        reply: '',
        todayUsage: used,
        todayLimit: limit,
        isPro,
        message: '무료 사용량(하루 5회)을 초과했습니다.',
      });
    }

    // LLM 호출 전에 카운트 증가 (프론트와 카운트 맞추기용)
    usageCounter.set(key, used + 1);

    // ===== 2. System 프롬프트 (페르소나 + tone + scenario 규칙) =====
    const systemPrompt = `
너는 10년 차 쿠팡/스마트스토어 판매자로, 고객 문의에 답변하는 CS 담당자이다.
항상 한국어로만 답변한다. 말투는 정중하고 명확하게 유지한다.
답변 길이는 150~220자 정도로 유지한다.
이모티콘이나 과한 느낌표/물음표(!!, ???)는 사용하지 않는다.
고객을 탓하는 표현이나 공격적으로 들릴 수 있는 표현을 쓰지 않는다.
"AI", "자동 응답" 같은 표현은 절대 쓰지 않는다.

[소규모 셀러 페르소나/스타일 가이드]
- 너는 "작은 온라인 쇼핑몰의 판매자/CS 담당자"다.
- 회사 공지문/약관체처럼 딱딱하지 않게, 실제 소규모 셀러가 쓰는 자연스러운 존댓말을 사용한다.
- 예시 어투:
  · "저희 쪽에서 바로 확인해서 처리 도와드리겠습니다."
  · "조금 번거로우시겠지만 ~ 부탁드리겠습니다."
- 반말/반쯤 반말, 이모티콘(ㅎㅎ, ^^, ㅠㅠ 등)은 사용하지 않는다.

[AI 티 줄이기]
- "AI", "자동 응답"이라는 표현은 절대 쓰지 않는다.
- 과하게 공식적인 표현은 피하고 자연스럽게 바꿔 쓴다.
  · "이용해 주셔서 진심으로 감사드립니다." → "이용해 주셔서 감사합니다."
  · "불편을 드려 대단히 죄송합니다." → "불편을 드려 정말 죄송합니다."
- 고객에게 책임을 돌리는 뉘앙스(예: "조금만 힘을 덜 주시면 괜찮습니다", "사용 방법을 잘못하셔서 발생했습니다" 등)는 사용하지 않는다.

[문장 패턴 다양화]
- 매 답변마다 첫 문장의 표현과 문장 길이를 가능하면 조금씩 바꾼다.
- 예: "문의 주셔서 감사합니다.", "질문 남겨 주셔서 감사합니다.", "문의 남겨 주셔서 감사드립니다." 등

- scenarioValue가 'review'일 때는, 리뷰에서 중요한 표현이나 문장을 한 번 이상 그대로 인용해서 답변에 포함해라.

[tone 적용 규칙]
- tone === "friendly":
  · 표현을 조금 더 부드럽게, 말끝을 완곡하게 사용한다.
- tone === "business":
  · 최대한 중립적이고 깔끔한 문장을 사용한다.
- tone === "principle":
  · 판매자의 정책과 기준을 분명하게 설명하되,
    상대방이 기분 나쁘지 않도록 조심스럽게 표현한다.

[scenario 적용 규칙: scenarioValue ∈ {general | claim | review}]
- scenarioValue === "general":
  · 배송일, 재고, 상품 정보 등 일반 문의라고 가정한다.
  · 답변 구조:
    1) 첫 문장에 가벼운 감사 또는 응대 표현
    2) 다음 1~2문장에서 핵심 답변을 간단하고 명확하게 설명
    3) 마지막 문장에서 추가 문의 가능성과 간단한 감사 인사를 덧붙임

- scenarioValue === "claim":
  · 파손, 불량, 환불, 교환, 반품, 취소, 지연, 불편, 불만 등 클레임/불만 상황이라고 가정한다.
  · 답변 구조(반드시 이 순서):
    1) 첫 문장: 고객의 불편을 인정하고 사과/공감 표현
    2) 다음 1~2문장: 판매자가 해줄 수 있는 구체 해결 방법 또는 진행 절차 안내
    3) 마지막 문장: 추가 문의 시 안내 + 감사 인사
  · 문제의 원인을 고객의 사용 실수로 돌리는 표현은 피하고, 판매자/제품 측의 확인과 개선 의지를 중심으로 설명한다.

- scenarioValue === "review":
  · 리뷰/후기에 다는 답글이라고 가정한다. clipboardText 내용을 바탕으로
    긍정/부정/복합(장점+단점 혼재)을 대략 구분해서 대응한다.
  · 공통 규칙:
    1) 리뷰에서 중요한 표현이나 문장을 한 번 이상 그대로 인용하거나 바꿔 말해 준다.
       (예: “허리나 어깨 부담이 줄었다고 말씀해 주셔서 저희도 기쁩니다.”)
    2) 리뷰어를 탓하거나 방어적으로 들리는 표현은 사용하지 않는다.
  · 긍정 리뷰로 보이는 경우:
    1) 첫 문장에서 진심 어린 감사 인사
    2) 다음 문장에서 리뷰에서 언급한 장점을 짚어 주고 함께 기뻐하는 표현
    3) 마지막 문장에서 재구매/재방문 유도 또는 브랜드/상호명 언급으로 마무리
  · 부정 또는 아쉬운 리뷰로 보이는 경우:
    1) 첫 문장에서 사과/공감 표현
    2) 다음 문장에서 리뷰에서 언급한 불편 포인트를 다시 짚고,
       개선 의지 또는 교환/환불/점검 등 구체적인 해결 방법을 간단히 안내
    3) 마지막 문장에서 감사 인사 및 추가 문의 안내
  · 사용법 안내가 꼭 필요한 내용(예: “어떻게 쓰는지 모르겠다”, “조립이 헷갈린다” 등)이 아닌 경우에는
    억지로 사용 팁을 제시하지 말고, 문제 해결과 후속 지원(교환/환불/점검) 중심으로 답변한다.
`.trim();

    // ===== 3. User 프롬프트 =====
    const userPrompt = `
[tone]: ${toneValue}
[scenario]: ${scenarioValue}

[고객 텍스트]:
${text}

위 [scenario]에 맞는 상황이라고 가정하고, 위의 규칙을 지키면서 하나의 답변만 작성해 줘.
문단은 1~3문단 이내로 자연스럽게 나눠 써 줘.
응답에는 한국어 답변 텍스트만 작성해 줘 (메타 정보, 리스트, 헤더 등 금지).
`.trim();

    // ===== 4. OpenAI Responses API 호출 (gpt-5-mini) =====
    const ai = await openai.responses.create({
      model: 'gpt-5-mini',
      input: [
        {
          role: 'system',
          content: [{ type: 'input_text', text: systemPrompt }],
        },
        {
          role: 'user',
          content: [{ type: 'input_text', text: userPrompt }],
        },
      ],
    });

    // ===== 5. output 파싱 (output_text 수집) =====
    let replyText = '';

    if (ai && Array.isArray(ai.output)) {
      for (const item of ai.output) {
        if (!item?.content) continue;
        for (const c of item.content) {
          if (c.type === 'output_text' && typeof c.text === 'string') {
            replyText += c.text;
          }
        }
      }
    }

    replyText = replyText.trim();

    if (!replyText) {
      return res.status(200).json({
        ok: false,
        reply: '',
        todayUsage: usageCounter.get(key) || used + 1,
        todayLimit: limit,
        isPro,
        message: '응답 생성에 실패했습니다. 잠시 후 다시 시도해 주세요.',
      });
    }

    // ===== 6. 정상 응답 =====
    return res.status(200).json({
      ok: true,
      reply: replyText,
      todayUsage: usageCounter.get(key) || used + 1,
      todayLimit: limit,
      isPro,
      message: isPro ? '생성 완료(프로)' : '생성 완료',
    });
  } catch (err) {
    console.error('Error in /api/generate:', err);

    // 에러가 나도 프론트는 항상 같은 형태의 JSON을 받도록 통일
    return res.status(200).json({
      ok: false,
      reply: '',
      todayUsage: 0,
      todayLimit: 5,
      isPro: false,
      message: '서버 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.',
    });
  }
}

// router 설정 (기존 구조 유지)
router.post('/generate', generateHandler);
router.post('/', generateHandler);

export default router;
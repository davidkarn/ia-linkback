// OpenRouter chat completions (for process-ocred-books and
// consolidate-footnote-insights, see cli/). Needs OPENROUTER_KEY.
import type { JSONSchema7 } from 'json-schema';

export type ORMessage = {
  role: 'system' | 'user',
  content: string
};

export type ORResponseFormat = {
  type: 'json_schema',
  json_schema: { name: string, strict: boolean, schema: JSONSchema7 }
};

// The parts of an OpenRouter chat completion response this code reads
export type ORResponse = {
  error?: { message?: string },
  choices?: { message?: { content?: unknown } }[],
};

export const makeOpenRouterRequest = (
  msgs: ORMessage[], responseFormat?: ORResponseFormat
) => (
  fetch('https://openrouter.ai/api/v1/chat/completions', {
    method:  'POST',
    headers: {
      Authorization:  'Bearer ' + process.env.OPENROUTER_KEY,
      'HTTP-Referer': 'https://webdever.net',
      'X-Title':      'Webdever',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model:    'openai/gpt-4o',
      messages: msgs,
      ...(responseFormat ? { response_format: responseFormat } : {}),
    }),
  })
    .then((result) => result.json() as Promise<ORResponse>)
);

// The message content of a structured-output response, parsed; throws on an error response
export const parseJsonResponse = <T>(response: ORResponse): T => {
  if (response.error) {
    throw new Error(response.error.message ?? JSON.stringify(response.error));
  }
  else {
    const content = response.choices?.[0]?.message?.content;
    if (typeof content !== 'string') {
      throw new Error('no content in response: ' + JSON.stringify(response));
    }
    else {
      return JSON.parse(content);
    }
  }
};

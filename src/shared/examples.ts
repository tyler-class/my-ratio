// Example requests people can make of an assistant connected to Ratio. One list feeds the MCP
// server instructions, the get_started tool and the "Try asking" list in Settings.

export interface ExamplePrompt {
  /** What to say, written the way a person would ask. <angle brackets> mark what to fill in. */
  prompt: string;
  /** Why it's worth asking, in a few words. */
  why: string;
}

export const EXAMPLE_PROMPTS: ExamplePrompt[] = [
  {
    prompt: 'Log a V60 of the <bean>, <rating> out of 10, a bit sour.',
    why: 'One sentence instead of a form.',
  },
  {
    prompt: 'Help me dial in the <bean>: look at my brews of it and tell me what to change next.',
    why: 'Your next grind and ratio, from your own data.',
  },
  {
    prompt:
      'What should I order next? Use my order again shortlist and the origins and processes I rate highest.',
    why: 'Picks based on what you actually liked.',
  },
  {
    prompt: 'Go through my unrated brews from this week and ask me how each one was.',
    why: 'Clears the rating backlog.',
  },
  {
    prompt: 'I just ordered <coffee> from <roaster>, <grams> g for <price>. Add it as ordered.',
    why: 'Tracked from order to last cup.',
  },
  {
    prompt: 'Which bags are ready to open, and how long will my stock last?',
    why: 'Plan what goes on the bar next.',
  },
  {
    prompt: 'I finished the <bean>. Mark it finished and ask whether I’d buy it again.',
    why: 'Feeds your order again shortlist.',
  },
  {
    prompt: 'Compare my V60 and AeroPress brews: which ratios and grinds rate best for each?',
    why: 'Each method’s sweet spot.',
  },
];

/** The ready-made MCP prompts, for listing alongside the examples. */
export const MCP_PROMPTS: { name: string; title: string; does: string }[] = [
  {
    name: 'dial_in',
    title: 'Dial in a bag',
    does: 'Reads every brew of a bag and suggests the next recipe to try.',
  },
  {
    name: 'rate_backlog',
    title: 'Rate my unrated brews',
    does: 'Walks through recent unrated brews one by one and saves your ratings.',
  },
  {
    name: 'what_to_order',
    title: 'What should I order next?',
    does: 'Suggests coffees from your shortlist and the origins and processes you rate highest.',
  },
  {
    name: 'finish_bag',
    title: 'Finish a bag',
    does: 'Sums up a bag, marks it finished with your buy-again call, and lines up the next one.',
  },
  {
    name: 'weekly_review',
    title: 'Weekly coffee review',
    does: 'What you brewed, how it rated, what’s ready to open, and how long your stock lasts.',
  },
];

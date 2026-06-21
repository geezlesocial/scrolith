(async () => {
  try {
    const postAi = require('../dist/services/postAi.service');
    const modes = ['grammar_fix','improve_grammar','rephrase','professional','make_professional','shorten','expand'];
    const text = "Hello, thank for the responses. I has many idea and need make it professional.";
    for (const mode of modes) {
      try {
        const result = await postAi.enhancePostDraftWithAi({ text, mode, safeMode: false, scope: 'user' });
        console.log('MODE:', mode);
        console.log(JSON.stringify(result, null, 2));
      } catch (err) {
        console.error('MODE ERROR:', mode, err && err.message ? err.message : err);
      }
    }
  } catch (error) {
    console.error('FAILED TO RUN SMOKE:', error && error.message ? error.message : error);
    process.exit(1);
  }
})();

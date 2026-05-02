const fs = require('fs');

function modifyAdapters() {
  const adapters = ['src/main/proxy/adapters/qwen-ai.ts', 'src/main/proxy/adapters/qwen.ts'];
  
  for (const file of adapters) {
    let code = fs.readFileSync(file, 'utf8');
    
    // Modify generateContextHash to normalize arguments string
    code = code.replace(
      /arguments: tc\.function\?\.arguments \|\| ''/g,
      `arguments: (() => {
              let args = tc.function?.arguments || '';
              try {
                const parsed = typeof args === 'string' ? JSON.parse(args) : args;
                return JSON.stringify(parsed);
              } catch (e) {
                return args;
              }
            })()`
    );

    fs.writeFileSync(file, code);
  }
}

modifyAdapters();
console.log('Normalized tool arguments!');

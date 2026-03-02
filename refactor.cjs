const fs = require('fs');
const path = require('path');

function walk(dir) {
    let results = [];
    const list = fs.readdirSync(dir);
    list.forEach(function (file) {
        file = path.join(dir, file);
        const stat = fs.statSync(file);
        if (stat && stat.isDirectory()) {
            results = results.concat(walk(file));
        } else {
            if (file.endsWith('.tsx') || file.endsWith('.ts')) {
                results.push(file);
            }
        }
    });
    return results;
}

const files = walk(path.join(__dirname, 'src'));

const replacements = [
    { from: /\btext-white\b/g, to: 'text-slate-900 dark:text-white' },
    { from: /\bbg-neo-bg\b/g, to: 'bg-slate-50 dark:bg-neo-bg' },
    { from: /\bborder-white\/5\b/g, to: 'border-slate-200 dark:border-white/5' },
    { from: /\bborder-white\/10\b/g, to: 'border-slate-200 dark:border-white/10' },
    { from: /\bborder-white\/20\b/g, to: 'border-slate-300 dark:border-white/20' },
    { from: /\bbg-white\/5\b/g, to: 'bg-slate-100 dark:bg-white/5' },
    { from: /\bbg-white\/\[0\.02\]\b/g, to: 'bg-slate-50 dark:bg-white/[0.02]' },
    { from: /\btext-slate-400\b/g, to: 'text-slate-600 dark:text-slate-400' },
    { from: /\btext-slate-300\b/g, to: 'text-slate-500 dark:text-slate-300' },
    { from: /\btext-slate-200\b/g, to: 'text-slate-700 dark:text-slate-200' },
    { from: /\bhover:bg-white\/5\b/g, to: 'hover:bg-slate-100 dark:hover:bg-white/5' },
    { from: /\bhover:text-white\b/g, to: 'hover:text-slate-900 dark:hover:text-white' },
    { from: /\bbg-slate-800\b/g, to: 'bg-slate-100 dark:bg-slate-800' },
    { from: /\bborder-slate-700\b/g, to: 'border-slate-300 dark:border-slate-700' },
    { from: /\btext-slate-500\b/g, to: 'text-slate-500 dark:text-slate-400' },
    { from: /\bbg-slate-800\/50\b/g, to: 'bg-slate-100 dark:bg-slate-800/50' },
    { from: /\bbg-slate-900\b/g, to: 'bg-slate-200 dark:bg-slate-900' },
    { from: /\bhover:bg-slate-800\b/g, to: 'hover:bg-slate-200 dark:hover:bg-slate-800' },
];

let changedFiles = 0;

for (const file of files) {
    let content = fs.readFileSync(file, 'utf8');
    let original = content;

    // Prevent double replacements
    if (content.includes('dark:text-white')) continue;

    for (const rule of replacements) {
        content = content.replace(rule.from, rule.to);
    }

    if (content !== original) {
        fs.writeFileSync(file, content, 'utf8');
        changedFiles++;
    }
}

console.log(`Refactored ${changedFiles} files to support light mode.`);

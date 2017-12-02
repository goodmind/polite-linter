'use strict';
const tslint = require('tslint');
const path = require('path');
const git = require('simple-git/promise')(process.cwd());
const colors = require('colors');

let {rulesDirectory, configurationFilename} = require('./environment');

class TSLinter {
    constructor() {
        const options = {
            fix: false,
            formatter: 'json',
            rulesDirectory: rulesDirectory
        };

        this.tsLinter = new tslint.Linter(options);
        this.config = tslint.Configuration.loadConfigurationFromPath(path.resolve(process.cwd(), configurationFilename));
    }

    lintOneFile(filename, fileContents) {
        this.tsLinter.lint(filename, fileContents, this.config);
        return this.tsLinter.getResult().failures
                   .map((failure) => (
                       {
                           rule: failure.ruleName,
                           text: failure.failure,
                           line: failure.startPosition.lineAndCharacter.line
                       }
                   ));
    }

    lintFewFiles(files) {
        return Promise.all(files.map(filename =>
            git.show(['HEAD:' + filename])
               .then(data => ({
                   filename,
                   lintResult: this.lintOneFile(filename, data)
               }))
        ));

    }

}
class PoliteHook {
    constructor(){
        this.tsLinter = new TSLinter();
    }

    getAllCommittedFiles() {
        return git
            .revparse(['--abbrev-ref', 'HEAD'])
            .then((branchName) => git.revparse(['origin/HEAD']))
            .catch((err) => 'origin/develop')
            .then((lastPushedCommit) => git.diff(['HEAD', lastPushedCommit.trim(), '--name-only']))
            .then((info) => {
                return info.split('\n').filter(file => !!file);
            });
    }

    outputErrors(lintResults) {
        if (lintResults.length) {
            console.log(colors.blue('I have linted files committed since last push and there are lint errors:'));
        }

        lintResults.forEach(fileData => {
            console.log(colors.magenta(fileData.filename));
            fileData.lintResult.forEach(({text, rule, line}) => {
                console.log('\t', colors.red(text), 'line:', colors.blue(line), 'rule: ' + colors.magenta(rule))
            })
        });

        if (lintResults.length) {
            process.exit(0);
        }
    }


    lintCommitted() {
        this.getAllCommittedFiles()
            .then((files) => this.tsLinter
                                 .lintFewFiles(files.filter(file => /\.ts|js$/.test(file))))
            .then(data => this.outputErrors(data))
            .catch(err => {
                console.log(colors.red(err));
                process.exit(0);
            });
    }
}

module.exports = new PoliteHook().lintCommitted;

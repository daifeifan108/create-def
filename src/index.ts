import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { Command } from 'commander'
import { reset, red, green, yellow } from 'kolorist'
import inquirer from 'inquirer'
type ProjectAttributeVo = {
    projectName: string
    overwrite: boolean
    framework: Framework
    variants: string
}
type ColorFunc = (str: string | number) => string
type Framework = {
    name: string
    display: string
    color: ColorFunc
    variants: FrameworkVariant[]
}
type FrameworkVariant = {
    name: string
    display: string
    color: ColorFunc
}
const FRAMEWORKS: Framework[] = [{
    name: 'vue',
    display: 'vue',
    color: green,
    variants: [{
        name: 'vue',
        display: 'Javascript',
        color: yellow
    }]
}]
const TEMPLATES = FRAMEWORKS.map(fk => (fk.variants && fk.variants.map(v => v.name)) || [fk.name]).reduce((p, c) => p.concat(c), [])
const defautlDir = 'def-project'
const cwd = process.cwd()
const program = new Command()
program
    .argument('[project-name]', 'Set project name')
    .option('-t, --template <name>', 'the names of templates to use')
    .action(function(projectName, options) {
        init(projectName, options)
    })
    .parse()
async function init(name: any, options: any) {
    const argDir = name
    const hasArgDir = argDir && argDir !== true
    let result: ProjectAttributeVo
    try {
        result = await inquirer.prompt<ProjectAttributeVo>([{
            type: 'input',
            name: 'projectName',
            message: reset('Project name:'),
            default: hasArgDir ? argDir : defautlDir,
            when: !hasArgDir
        }, {
            type: 'confirm',
            name: 'overwrite',
            message: 'target directory is not empty. Remove existing files and continue?',
            when: function(ans) {
                return fs.existsSync(ans.projectName)
            },
            validate(input) {
                if (!input) {
                    return red('✖') + ' Operation cancelled'
                }
                return true
            }
        }, {
            type: 'list',
            name: 'framework',
            message: function() {
                if (typeof options.template === 'string' && TEMPLATES.includes(options.template)) {
                    return `"${options.template}" isn't a valid template. Please choose from below: `
                }
                return reset('Select a framework:')
            },
            choices: FRAMEWORKS.map((fk) => {
                const clr = fk.color
                return { name: clr(fk.display || fk.name), value: fk }
            })
        }, {
            type: 'list',
            name: 'variants',
            message: reset('Select a variant:'),
            when: function(ans) {
                return !!(ans.framework && ans.framework.variants)
            },
            choices: function(ans) {
                return ans.framework.variants.map((v) => {
                    const clr = v.color
                    return {
                        name: clr(v.display || v.name),
                        value: v.name
                    }
                })
            }
        }])
        const { projectName, overwrite, framework, variants } = result
        const root = path.join(cwd, projectName)
        if (overwrite) {
            emptyDir(root)
        } else if (!fs.existsSync(root)) {
            fs.mkdirSync(root, { recursive: true })
        } else if (overwrite === false) {
            throw new Error('cancelled!')
        }
        const template: string = variants || framework.name || options.template
        const pkgInfo = pkgFromUserAgent(process.env.npm_config_user_agent)
        const pkgManager = pkgInfo ? pkgInfo.name : 'npm'
        console.log(`\nScaffolding project in ${root}...`)
        const templateDir = path.resolve(fileURLToPath(import.meta.url), '../../templates/', template)

        const writeFile = (file: string, content?: string) => {
            const targetPath = path.join(root, file)
            if (content) {
                fs.writeFileSync(targetPath, content)
            } else {
                copy(path.join(templateDir, file), targetPath)
            }
        }
        const files = fs.readdirSync(templateDir)
        for (const file of files.filter(f => f !== 'package.json')) {
            writeFile(file)
        }

        const pkg = JSON.parse(
            fs.readFileSync(path.join(templateDir, `package.json`), 'utf-8')
        )
        pkg.name = projectName
        writeFile('package.json', JSON.stringify(pkg, null, 2))
        console.log(`\nDone. Now run:\n`)
        if (root !== cwd) {
            console.log(`  cd ${path.relative(cwd, root)}`)
        }
        switch (pkgManager) {
            case 'yarn':
              console.log('  yarn')
              console.log('  yarn dev')
              break
            default:
              console.log(`  ${pkgManager} install`)
              console.log(`  ${pkgManager} run dev`)
              break
        }
        console.log()
    } catch (error) {
        console.log(error)
    }
}

function copy(src: string, dest: string) {
    const stat = fs.statSync(src)
    if (stat.isDirectory()) {
      copyDir(src, dest)
    } else {
      fs.copyFileSync(src, dest)
    }
}

function copyDir(srcDir: string, destDir: string) {
    fs.mkdirSync(destDir, { recursive: true })
    for (const file of fs.readdirSync(srcDir)) {
      const srcFile = path.resolve(srcDir, file)
      const destFile = path.resolve(destDir, file)
      copy(srcFile, destFile)
    }
}

function emptyDir(dir: string) {
    if (!fs.existsSync(dir)) {
        return
    }
    for (const file of fs.readdirSync(dir)) {
        if (file === '.git') {
            continue
        }
        fs.rmSync(path.resolve(dir, file), { recursive: true, force: true })
    }
}
function pkgFromUserAgent(userAgent: string | undefined) {
    if (!userAgent) return undefined
    const pkgSpec = userAgent.split(' ')[0]
    const pkgSpecArr = pkgSpec.split('/')
    return {
      name: pkgSpecArr[0],
      version: pkgSpecArr[1]
    }
}
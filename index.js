import { setOutput, setFailed, addPath } from "@actions/core";
import * as core from '@actions/core'
import * as tc from "@actions/tool-cache";
import { mkdirP } from "@actions/io";
import { exec } from "@actions/exec";
import * as path from "node:path";


const CACHE_KEY = "llvm-dev-libs";
const platform = Object.freeze({
    isWindows: process.platform.startsWith("win"),
    isMacOS: process.platform === "darwin",
    isLinux: process.platform === "linux",
    arch: process.arch,
});



let get_dest = () => path.join(process.cwd(), ".llvm");
let untar = async (path, dest) => {
    let exit = await exec("tar", ["xf", path, "-C", dest, ]);
    if (exit !== 0) {
        throw new Error(`Failed to untar '${path}' into '${dest}'`);
    }
    return dest
}
let unseven = async (path, dest) => {
    let exit = await exec("7z", ["x", path, `-o${dest}`, "-y"]);
    if (exit !== 0) {
        throw new Error(`Failed to untar '${path}' into '${dest}'`);
    }
    return dest
}

class Installer {
    constructor() {
        this.base_url = core.getInput("base-url") || "https://github.com/FreeMasen/llvm-builds/releases/download"
        this.version = core.getInput("version");
        if (platform.isWindows) {
            this.prefix = "LLVM";
            this.arch = null;
            this.suffix = "win64";
            this.extension = "exe";
        } else {
            this.prefix = "clang+llvm"
            this.arch = platform.arch.includes("arm") ? "aarch64" : "x86_64";
            this.extension = "tar.xz";
            if (platform.isMacOS) {
                this.suffix = "apple-darwin";
            } else if (platform.isLinux) {
                this.suffix = "linux";
            }
        } 
    }

    /**
     * Get the url for this arch/os combination
     * @returns string
     */
    get_url() {
        console.log(`Installer.get_url()`);
        let rel = `v${this.version}`;
        let file = `${this.prefix}-${this.version}-`;
        if (!!this.arch) {
            file += `${this.arch}-`
        }
        file += `${this.suffix}.${this.extension}`;
        let url = `${this.base_url}/${rel}/${file}`;
        console.log("get_url->", url);
        return url;
    }

    /**
     * Decompress the archive
     * @param {string} path fs path the archive was saved to
     * @returns string The path llvm was decompressed to
     */
    async decompress(path) {
        console.log(`Installer.decompress("${path}")`);
        let decomp = platform.isWindows ? unseven : untar;
        let dest = get_dest();
        await mkdirP(dest);
        let ret = await decomp(path, dest);
        console.log("decompress->", ret);
        return ret
    }
}

(async () => {
    console.log("Installing llvm libs");
    let installer = new Installer();
    // Lookup the libs from the cache
    let archive_path = tc.find(CACHE_KEY, installer.version);
    if (!archive_path || archive_path.length <= 0) {
        console.log("llvm libs were not found in the cache, downloading");
        // If not in the cache, download the archive
        let url = installer.get_url();
        archive_path = await tc.downloadTool(url);
    }
    console.log("caching archive", archive_path);
    
    // Cache the archive to save space in the cache
    tc.cacheFile(archive_path, path.basename(archive_path), CACHE_KEY, installer.version);
    console.log("decompressing archive");
    let saved_location = await installer.decompress(archive_path);
    console.log("decompressed into", saved_location);
    let bin_dir = path.join(saved_location, "bin");
    console.log("adding bin_dir to PATH", bin_dir);
    addPath(bin_dir);
    return saved_location
})().then(install_path => {
    console.log("Successfully installed llvm libs to", install_path);
    setOutput("directory", install_path);
}).catch(error => {
    setFailed(error.message);
});

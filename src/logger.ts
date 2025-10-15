export class Logger {
    private name: String;

    constructor(name: String) {
        this.name = name;
    }

    log = (msg: String) => {
        console.log(`%c${this.name}: ` + `%c${msg}`, "color: green", "");
    };
}
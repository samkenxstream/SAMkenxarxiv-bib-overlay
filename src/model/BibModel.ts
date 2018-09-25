import { action, observable } from 'mobx'
import { AdsDatasource } from '../api/AdsDatasource'
import { DataSource, Paper, PaperGroup } from '../api/document'
import { InspireDatasource } from '../api/InspireDatasource'
import { S2Datasource } from '../api/S2Datasource'
import { get_categories, get_current_article } from '../arxiv_page'
import { API_STATS_IMAGE, POLICY_DATASOURCE_LIST, POLICY_RECORD_API_STATS } from '../bib_config'
import { cookies } from '../cookies'
import { state, Status } from './State'

export class BibModel {
    arxivId: string = ''
    primary: string = ''
    visitid: string = Math.random().toString().substring(2, 12)

    @observable
    allDS: DataSource[] = [
        new InspireDatasource(),
        new AdsDatasource(),
        new S2Datasource()
    ].filter((i) => POLICY_DATASOURCE_LIST.indexOf(i.shortname.toLowerCase()) >= 0)

    @observable
    availableDS: DataSource[]

    @observable
    currentDS: DataSource

    @observable
    paper: Paper

    @observable
    citations: PaperGroup

    @observable
    references: PaperGroup

    get article_category() {
        if (this.category) {
            return this.category
        }

        const cats: string[][] = get_categories()
        if (cats && cats.length > 0 && cats[0].length > 0) {
            return cats[0][0]
        }

        throw new Error('No primary category found')
    }

    get article_id() {
        if (this.arxivId) {
            return this.arxivId
        }

        return get_current_article()
    }

    configureAvailable(category: string) {
        return this.allDS.filter((ds) => ds.categories.has(category))
    }

    @action
    setDS(dataSource: DataSource): void {
        state.state = Status.LOADING
        state.messages = []
        state.errors = []

        cookies.set_datasource(this.article_category, dataSource.shortname)
        this.currentDS = dataSource
        this.currentDS.fetch_all(this.article_id)
            .then(ds => this.populateFromDSResult(ds))
            .catch(error => this.populateFromDSError(error))
    }

    @action
    loadFromAbtract() {
        const arxivId = get_current_article()
        const categories = get_categories()

        if (categories.length === 0 || categories[0].length === 0) {
            throw new Error('No categories found for article')
        }

        this.loadSource(arxivId, categories)
    }

    @action
    loadSource(arxivId: string, primary: string, force: boolean = false): void {
        this.arxivId = arxivId
        this.primary = primary

        this.availableDS = this.configureAvailable(this.category)
        if (this.availableDS.length !== 0) {
            const savedDS = cookies.get_datasource(primary)

            if (savedDS) {
                const source = this.availableDS.filter((i) => i.shortname === savedDS)
                this.setDS(source[0])
            } else {
                this.setDS(this.availableDS[0])
            }
        }
        this.record_api()
    }

    @action
    reloadSource(): void {
        if (!this.currentDS) {
            this.loadFromAbtract()
        } else {
            this.setDS(this.currentDS)
            this.record_api()
        }
    }

    @action
    populateFromDSResult(ds: DataSource): void {
        state.state = Status.LOADED

        this.paper = ds.data
        if (ds.data.citations) {
            this.citations = ds.data.citations
        }
        if (ds.data.references) {
            this.references = ds.data.references
        }
    }

    @action
    populateFromDSError(error: Error): void {
        state.error(error.message)
    }

    record_api() {
        if (!POLICY_RECORD_API_STATS) {
            return
        }

        const cats = get_categories().map((i) => i[1]).join(':')
        const active = state.isdisabled ? 'disabled' : 'enabled'
        const ds = state.bibmodel.currentDS ? state.bibmodel.currentDS.shortname : 'none'
        fetch(`${API_STATS_IMAGE}?${ds}&${cats}&${active}&${this.visitid}`)
    }
}

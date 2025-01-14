/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the Source EULA. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as azdata from 'azdata';
import { MigrationWizardPage } from '../models/migrationWizardPage';
import { MigrationStateModel, MigrationTargetType, StateChangeEvent } from '../models/stateMachine';
import { AssessmentResultsDialog } from '../dialog/assessmentResults/assessmentResultsDialog';
import * as constants from '../constants/strings';
import * as vscode from 'vscode';
import { EOL } from 'os';
import { IconPath, IconPathHelper } from '../constants/iconPathHelper';
import { WIZARD_INPUT_COMPONENT_WIDTH } from './wizardController';

export interface Product {
	type: MigrationTargetType;
	name: string,
	icon: IconPath;
}

export class SKURecommendationPage extends MigrationWizardPage {

	private _view!: azdata.ModelView;
	private _igComponent!: azdata.TextComponent;
	private _assessmentStatusIcon!: azdata.ImageComponent;
	private _detailsComponent!: azdata.TextComponent;
	private _chooseTargetComponent!: azdata.DivContainer;
	private _azureSubscriptionText!: azdata.TextComponent;
	private _managedInstanceSubscriptionDropdown!: azdata.DropDownComponent;
	private _azureLocationDropdown!: azdata.DropDownComponent;
	private _azureResourceGroupDropdown!: azdata.DropDownComponent;
	private _resourceDropdownLabel!: azdata.TextComponent;
	private _resourceDropdown!: azdata.DropDownComponent;
	private _rbg!: azdata.RadioCardGroupComponent;
	private eventListener!: vscode.Disposable;
	private _rbgLoader!: azdata.LoadingComponent;
	private _progressContainer!: azdata.FlexContainer;
	private _assessmentComponent!: azdata.FlexContainer;
	private _assessmentProgress!: azdata.TextComponent;
	private _assessmentInfo!: azdata.TextComponent;
	private _formContainer!: azdata.ComponentBuilder<azdata.FormContainer, azdata.ComponentProperties>;
	private _assessmentLoader!: azdata.LoadingComponent;
	private _rootContainer!: azdata.FlexContainer;

	private _supportedProducts: Product[] = [
		{
			type: MigrationTargetType.SQLMI,
			name: constants.SKU_RECOMMENDATION_MI_CARD_TEXT,
			icon: IconPathHelper.sqlMiLogo
		},
		{
			type: MigrationTargetType.SQLVM,
			name: constants.SKU_RECOMMENDATION_VM_CARD_TEXT,
			icon: IconPathHelper.sqlVmLogo
		}
	];


	constructor(wizard: azdata.window.Wizard, migrationStateModel: MigrationStateModel) {
		super(wizard, azdata.window.createWizardPage(constants.SKU_RECOMMENDATION_PAGE_TITLE), migrationStateModel);
	}

	protected async registerContent(view: azdata.ModelView) {
		this._view = view;
		this._igComponent = this.createStatusComponent(view); // The first component giving basic information
		this._assessmentStatusIcon = this._view.modelBuilder.image().withProps({
			iconPath: IconPathHelper.completedMigration,
			iconHeight: 17,
			iconWidth: 17,
			width: 17,
			height: 20
		}).component();
		const igContainer = this._view.modelBuilder.flexContainer().component();
		igContainer.addItem(this._assessmentStatusIcon, {
			flex: '0 0 auto'
		});
		igContainer.addItem(this._igComponent, {
			flex: '0 0 auto'
		});

		this._detailsComponent = this.createDetailsComponent(view); // The details of what can be moved

		const statusContainer = this._view.modelBuilder.flexContainer().withLayout({
			flexFlow: 'column'
		}).withItems(
			[
				igContainer,
				this._detailsComponent
			]
		).component();
		this._chooseTargetComponent = await this.createChooseTargetComponent(view);
		this._azureSubscriptionText = this.createAzureSubscriptionText(view);


		const managedInstanceSubscriptionDropdownLabel = view.modelBuilder.text().withProps({
			value: constants.SUBSCRIPTION,
			width: WIZARD_INPUT_COMPONENT_WIDTH
		}).component();
		this._managedInstanceSubscriptionDropdown = view.modelBuilder.dropDown().withProps({
			width: WIZARD_INPUT_COMPONENT_WIDTH
		}).component();
		this._managedInstanceSubscriptionDropdown.onValueChanged((e) => {
			if (e.selected) {
				this.migrationStateModel._targetSubscription = this.migrationStateModel.getSubscription(e.index);
				this.migrationStateModel._targetServerInstance = undefined!;
				this.migrationStateModel._sqlMigrationService = undefined!;
				this.populateLocationAndResourceGroupDropdown();
			}
		});
		this._resourceDropdownLabel = view.modelBuilder.text().withProps({
			value: constants.MANAGED_INSTANCE,
			width: WIZARD_INPUT_COMPONENT_WIDTH
		}).component();

		const azureLocationLabel = view.modelBuilder.text().withProps({
			value: constants.LOCATION,
			width: WIZARD_INPUT_COMPONENT_WIDTH
		}).component();
		this._azureLocationDropdown = view.modelBuilder.dropDown().withProps({
			width: WIZARD_INPUT_COMPONENT_WIDTH
		}).component();
		this._azureLocationDropdown.onValueChanged((e) => {
			if (e.selected) {
				this.migrationStateModel._location = this.migrationStateModel.getLocation(e.index);
				this.populateResourceInstanceDropdown();
			}
		});
		this._resourceDropdownLabel = view.modelBuilder.text().withProps({
			value: constants.MANAGED_INSTANCE,
			width: WIZARD_INPUT_COMPONENT_WIDTH
		}).component();


		const azureResourceGroupLabel = view.modelBuilder.text().withProps({
			value: constants.RESOURCE_GROUP,
			width: WIZARD_INPUT_COMPONENT_WIDTH
		}).component();
		this._azureResourceGroupDropdown = view.modelBuilder.dropDown().withProps({
			width: WIZARD_INPUT_COMPONENT_WIDTH
		}).component();
		this._azureResourceGroupDropdown.onValueChanged((e) => {
			if (e.selected) {
				this.migrationStateModel._resourceGroup = this.migrationStateModel.getAzureResourceGroup(e.index);
				this.populateResourceInstanceDropdown();
			}
		});
		this._resourceDropdownLabel = view.modelBuilder.text().withProps({
			value: constants.MANAGED_INSTANCE,
			width: WIZARD_INPUT_COMPONENT_WIDTH
		}).component();

		this._resourceDropdown = view.modelBuilder.dropDown().withProps({
			width: WIZARD_INPUT_COMPONENT_WIDTH
		}).component();
		this._resourceDropdown.onValueChanged((e) => {
			if (e.selected &&
				e.selected !== constants.NO_MANAGED_INSTANCE_FOUND &&
				e.selected !== constants.NO_VIRTUAL_MACHINE_FOUND) {
				this.migrationStateModel._sqlMigrationServices = undefined!;
				if (this._rbg.selectedCardId === MigrationTargetType.SQLVM) {
					this.migrationStateModel._targetServerInstance = this.migrationStateModel.getVirtualMachine(e.index);
				} else {
					this.migrationStateModel._targetServerInstance = this.migrationStateModel.getManagedInstance(e.index);
				}
			}
		});

		const targetContainer = view.modelBuilder.flexContainer().withItems(
			[
				managedInstanceSubscriptionDropdownLabel,
				this._managedInstanceSubscriptionDropdown,
				azureLocationLabel,
				this._azureLocationDropdown,
				azureResourceGroupLabel,
				this._azureResourceGroupDropdown,
				this._resourceDropdownLabel,
				this._resourceDropdown
			]
		).withLayout({
			flexFlow: 'column'
		}).component();





		this._formContainer = view.modelBuilder.formContainer().withFormItems(
			[
				{
					title: '',
					component: statusContainer
				},
				{
					title: constants.SKU_RECOMMENDATION_CHOOSE_A_TARGET,
					component: this._chooseTargetComponent
				},
				{
					component: this._azureSubscriptionText
				},
				{
					component: targetContainer
				}
			]
		).withProps({
			CSSStyles: {
				display: 'none'
			}
		});

		this._assessmentComponent = this._view.modelBuilder.flexContainer().withLayout({
			height: '100%',
			flexFlow: 'column'
		}).withProps({
			CSSStyles: {
				'margin-left': '30px'
			}
		}).component();

		this._assessmentComponent.addItem(this.createAssessmentProgress(), { flex: '0 0 auto' });
		this._assessmentComponent.addItem(await this.createAssessmentInfo(), { flex: '0 0 auto' });

		this._rootContainer = this._view.modelBuilder.flexContainer().withLayout({
			height: '100%',
			flexFlow: 'column'
		}).component();
		this._rootContainer.addItem(this._assessmentComponent, { flex: '0 0 auto' });
		this._rootContainer.addItem(this._formContainer.component(), { flex: '0 0 auto' });

		await this._view.initializeModel(this._rootContainer);
	}

	private createStatusComponent(view: azdata.ModelView): azdata.TextComponent {
		const component = view.modelBuilder.text().withProps({
			CSSStyles: {
				'font-size': '14px',
				'margin': '0 0 0 8px',
				'line-height': '20px'
			}
		}).component();
		return component;
	}

	private createDetailsComponent(view: azdata.ModelView): azdata.TextComponent {
		const component = view.modelBuilder.text().withProps({
			CSSStyles: {
				'font-size': '13px'
			}
		}).component();
		return component;
	}

	private async createChooseTargetComponent(view: azdata.ModelView): Promise<azdata.DivContainer> {

		this._rbg = this._view!.modelBuilder.radioCardGroup().withProps({
			cards: [],
			cardWidth: '600px',
			cardHeight: '40px',
			orientation: azdata.Orientation.Vertical,
			iconHeight: '30px',
			iconWidth: '30px'
		}).component();

		this._supportedProducts.forEach((product) => {
			const descriptions: azdata.RadioCardDescription[] = [
				{
					textValue: product.name,
					textStyles: {
						'font-size': '14px',
						'font-weight': 'bold',
						'line-height': '20px'
					},
					linkDisplayValue: 'Learn more',
					linkStyles: {
						'font-size': '14px',
						'line-height': '20px'
					},
					displayLinkCodicon: true,
					linkCodiconStyles: {
						'font-size': '14px',
						'line-height': '20px'
					},
				},
				{
					textValue: '0 selected',
					textStyles: {
						'font-size': '13px',
						'line-height': '18px'
					},
					linkStyles: {
						'font-size': '14px',
						'line-height': '20px'
					},
					linkDisplayValue: 'View/Change',
					displayLinkCodicon: true,
					linkCodiconStyles: {
						'font-size': '13px',
						'line-height': '18px'
					}
				}
			];

			this._rbg.cards.push({
				id: product.type,
				icon: product.icon,
				descriptions
			});
		});

		const serverName = (await this.migrationStateModel.getSourceConnectionProfile()).serverName;
		let miDialog = new AssessmentResultsDialog('ownerUri', this.migrationStateModel, constants.ASSESSMENT_TILE(serverName), this, MigrationTargetType.SQLMI);
		let vmDialog = new AssessmentResultsDialog('ownerUri', this.migrationStateModel, constants.ASSESSMENT_TILE(serverName), this, MigrationTargetType.SQLVM);

		this._rbg.onLinkClick(async (value) => {
			if (value.cardId === MigrationTargetType.SQLVM) {
				this._rbg.selectedCardId = MigrationTargetType.SQLVM;
				if (value.description.linkDisplayValue === 'View/Change') {
					await vmDialog.openDialog();
				} else if (value.description.linkDisplayValue === 'Learn more') {
					vscode.env.openExternal(vscode.Uri.parse('https://docs.microsoft.com/azure/azure-sql/virtual-machines/windows/sql-server-on-azure-vm-iaas-what-is-overview'));
				}
			} else if (value.cardId === MigrationTargetType.SQLMI) {
				this._rbg.selectedCardId = MigrationTargetType.SQLMI;
				if (value.description.linkDisplayValue === 'View/Change') {
					await miDialog.openDialog();
				} else if (value.description.linkDisplayValue === 'Learn more') {
					vscode.env.openExternal(vscode.Uri.parse('https://docs.microsoft.com/azure/azure-sql/managed-instance/sql-managed-instance-paas-overview '));
				}
			}
		});

		this._rbg.onSelectionChanged((value) => {
			this.changeTargetType(value.cardId);
		});

		this._rbg.selectedCardId = MigrationTargetType.SQLMI;

		this._rbgLoader = this._view.modelBuilder.loadingComponent().withItem(
			this._rbg
		).component();

		const component = view.modelBuilder.divContainer().withItems(
			[
				this._rbgLoader
			]
		).component();
		return component;
	}

	private changeTargetType(newTargetType: string) {
		if (newTargetType === MigrationTargetType.SQLMI) {
			this.migrationStateModel._targetType = MigrationTargetType.SQLMI;
			this._azureSubscriptionText.value = constants.SELECT_AZURE_MI;
			this.migrationStateModel._migrationDbs = this.migrationStateModel._miDbs;
		} else {
			this.migrationStateModel._targetType = MigrationTargetType.SQLVM;
			this._azureSubscriptionText.value = constants.SELECT_AZURE_VM;
			this.migrationStateModel._migrationDbs = this.migrationStateModel._vmDbs;
		}
		this.migrationStateModel.refreshDatabaseBackupPage = true;
		this.populateResourceInstanceDropdown();
	}

	private async constructDetails(): Promise<void> {
		this._assessmentLoader.loading = true;
		const serverName = (await this.migrationStateModel.getSourceConnectionProfile()).serverName;
		this._igComponent.value = constants.ASSESSMENT_COMPLETED(serverName);
		try {
			await this.migrationStateModel.getServerAssessments();
			this._detailsComponent.value = constants.SKU_RECOMMENDATION_ALL_SUCCESSFUL(this.migrationStateModel._assessmentResults.databaseAssessments.length);
		} catch (e) {
			console.log(e);
		}

		this.refreshCardText();
		this._assessmentLoader.loading = false;
	}

	private createAzureSubscriptionText(view: azdata.ModelView): azdata.TextComponent {
		const component = view.modelBuilder.text().withProps({
			CSSStyles: {
				'font-size': '13px',
				'line-height': '18px'
			}
		}).component();

		return component;
	}

	private async populateSubscriptionDropdown(): Promise<void> {
		if (!this.migrationStateModel._targetSubscription) {
			this._managedInstanceSubscriptionDropdown.loading = true;
			this._resourceDropdown.loading = true;
			try {
				this._managedInstanceSubscriptionDropdown.values = await this.migrationStateModel.getSubscriptionsDropdownValues();
			} catch (e) {
				console.log(e);
			} finally {
				this._managedInstanceSubscriptionDropdown.loading = false;
			}
		}
	}

	public async populateLocationAndResourceGroupDropdown(): Promise<void> {
		this._azureResourceGroupDropdown.loading = true;
		this._azureLocationDropdown.loading = true;
		try {
			this._azureResourceGroupDropdown.values = await this.migrationStateModel.getAzureResourceGroupDropdownValues(this.migrationStateModel._targetSubscription);
			this._azureLocationDropdown.values = await this.migrationStateModel.getAzureLocationDropdownValues(this.migrationStateModel._targetSubscription);
		} catch (e) {
			console.log(e);
		} finally {
			this._azureResourceGroupDropdown.loading = false;
			this._azureLocationDropdown.loading = false;
		}
	}

	private async populateResourceInstanceDropdown(): Promise<void> {
		this._resourceDropdown.loading = true;
		try {
			if (this._rbg.selectedCardId === MigrationTargetType.SQLVM) {
				this._resourceDropdownLabel.value = constants.AZURE_SQL_DATABASE_VIRTUAL_MACHINE;
				this._resourceDropdown.values = await this.migrationStateModel.getSqlVirtualMachineValues(this.migrationStateModel._targetSubscription, this.migrationStateModel._location, this.migrationStateModel._resourceGroup);

			} else {
				this._resourceDropdownLabel.value = constants.AZURE_SQL_DATABASE_MANAGED_INSTANCE;
				this._resourceDropdown.values = await this.migrationStateModel.getManagedInstanceValues(this.migrationStateModel._targetSubscription, this.migrationStateModel._location, this.migrationStateModel._resourceGroup);
			}
		} catch (e) {
			console.log(e);
		} finally {
			this._resourceDropdown.loading = false;
		}
	}


	public async onPageEnter(): Promise<void> {
		this.wizard.registerNavigationValidator((pageChangeInfo) => {
			const errors: string[] = [];
			this.wizard.message = {
				text: '',
				level: azdata.window.MessageLevel.Error
			};
			if (pageChangeInfo.newPage < pageChangeInfo.lastPage) {
				return true;
			}
			if (this.migrationStateModel._migrationDbs.length === 0) {
				errors.push('Please select databases to migrate');

			}
			if ((<azdata.CategoryValue>this._managedInstanceSubscriptionDropdown.value).displayName === constants.NO_SUBSCRIPTIONS_FOUND) {
				errors.push(constants.INVALID_SUBSCRIPTION_ERROR);
			}
			if ((<azdata.CategoryValue>this._azureLocationDropdown.value).displayName === constants.NO_LOCATION_FOUND) {
				errors.push(constants.INVALID_LOCATION_ERROR);
			}

			if ((<azdata.CategoryValue>this._managedInstanceSubscriptionDropdown.value).displayName === constants.RESOURCE_GROUP_NOT_FOUND) {
				errors.push(constants.INVALID_RESOURCE_GROUP_ERROR);
			}
			const resourceDropdownValue = (<azdata.CategoryValue>this._resourceDropdown.value).displayName;
			if (resourceDropdownValue === constants.NO_MANAGED_INSTANCE_FOUND) {
				errors.push(constants.NO_MANAGED_INSTANCE_FOUND);
			}
			else if (resourceDropdownValue === constants.NO_VIRTUAL_MACHINE_FOUND) {
				errors.push(constants.NO_VIRTUAL_MACHINE_FOUND);
			}

			if (errors.length > 0) {
				this.wizard.message = {
					text: errors.join(EOL),
					level: azdata.window.MessageLevel.Error
				};
				return false;
			}
			return true;
		});
		this.wizard.nextButton.enabled = false;
		if (!this.migrationStateModel._assessmentResults) {
			await this.constructDetails();
		}
		this._assessmentComponent.updateCssStyles({
			display: 'none'
		});
		this._formContainer.component().updateCssStyles({
			display: 'block'
		});

		this.populateSubscriptionDropdown();
		this.wizard.nextButton.enabled = true;
	}

	public async onPageLeave(): Promise<void> {
		this.eventListener?.dispose();
		this.wizard.message = {
			text: '',
			level: azdata.window.MessageLevel.Error
		};
		this.wizard.registerNavigationValidator((pageChangeInfo) => {
			return true;
		});
	}

	protected async handleStateChange(e: StateChangeEvent): Promise<void> {
	}

	public refreshDatabaseCount(selectedDbs: string[]): void {
		this.migrationStateModel._migrationDbs = selectedDbs;
		this.refreshCardText();
	}

	public refreshCardText(): void {
		this._rbgLoader.loading = true;
		this.wizard.message = {
			text: '',
			level: azdata.window.MessageLevel.Error
		};

		if (this._rbg.selectedCardId === MigrationTargetType.SQLMI) {
			this.migrationStateModel._migrationDbs = this.migrationStateModel._miDbs;
		} else {
			this.migrationStateModel._migrationDbs = this.migrationStateModel._vmDbs;
		}


		if (this.migrationStateModel._assessmentResults) {
			const dbCount = this.migrationStateModel._assessmentResults.databaseAssessments.length;

			const dbWithoutIssuesCount = this.migrationStateModel._assessmentResults.databaseAssessments.filter(db => db.issues.length === 0).length;
			const miCardText = `${dbWithoutIssuesCount} out of ${dbCount} databases can be migrated (${this.migrationStateModel._miDbs.length} selected)`;
			this._rbg.cards[0].descriptions[1].textValue = miCardText;

			const vmCardText = `${dbCount} out of ${dbCount} databases can be migrated (${this.migrationStateModel._vmDbs.length} selected)`;
			this._rbg.cards[1].descriptions[1].textValue = vmCardText;

			this._rbg.updateProperties({
				cards: this._rbg.cards
			});
		} else {

			const miCardText = `${this.migrationStateModel._miDbs.length} selected`;
			this._rbg.cards[0].descriptions[1].textValue = miCardText;

			const vmCardText = `${this.migrationStateModel._vmDbs.length} selected`;
			this._rbg.cards[1].descriptions[1].textValue = vmCardText;

			this._rbg.updateProperties({
				cards: this._rbg.cards
			});
		}
		this._rbgLoader.loading = false;
	}

	private createAssessmentProgress(): azdata.FlexContainer {

		this._assessmentLoader = this._view.modelBuilder.loadingComponent().component();
		this._assessmentProgress = this._view.modelBuilder.text().withProps({
			value: constants.ASSESSMENT_IN_PROGRESS,
			CSSStyles: {
				'font-size': '18px',
				'line-height': '24px',
				'margin-right': '20px'
			}
		}).component();

		this._progressContainer = this._view.modelBuilder.flexContainer().withLayout({
			height: '100%',
			flexFlow: 'row'
		}).component();

		this._progressContainer.addItem(this._assessmentProgress, { flex: '0 0 auto' });
		this._progressContainer.addItem(this._assessmentLoader, { flex: '0 0 auto' });
		return this._progressContainer;
	}

	private async createAssessmentInfo(): Promise<azdata.TextComponent> {
		this._assessmentInfo = this._view.modelBuilder.text().withProps({
			value: constants.ASSESSMENT_IN_PROGRESS_CONTENT((await this.migrationStateModel.getSourceConnectionProfile()).serverName),
			CSSStyles: {
				'font-size': '13px',
				'line-height': '18px',
				'font-weight': '600',
			}
		}).component();
		return this._assessmentInfo;
	}
}



import { Contact } from './contact.js';
import { Sequence } from './sequence.js';
import { Send } from './send.js';
import { SendingAccount } from './sendingAccount.js';
import { Conversion } from './conversion.js';
import { Company } from './company.js';
import { EmailEvent } from './emailEvent.js';
import { List } from './list.js';
import { ListMember } from './listMember.js';
import { EmailTemplate } from './emailTemplate.js';
import { ActivityLog } from './activityLog.js';

// Existing associations
Contact.hasMany(Send, { foreignKey: 'contact_id', as: 'sends' });
Send.belongsTo(Contact, { foreignKey: 'contact_id', as: 'contact' });

Sequence.hasMany(Send, { foreignKey: 'sequence_id', as: 'sends' });
Send.belongsTo(Sequence, { foreignKey: 'sequence_id', as: 'sequence' });

Contact.hasMany(Conversion, { foreignKey: 'contact_id', as: 'conversions' });
Conversion.belongsTo(Contact, { foreignKey: 'contact_id', as: 'contact' });

// v2 associations
Company.hasMany(Contact, { foreignKey: 'company_id', as: 'contacts' });
Contact.belongsTo(Company, { foreignKey: 'company_id', as: 'company_record' });

Send.hasMany(EmailEvent, { foreignKey: 'send_id', as: 'events' });
EmailEvent.belongsTo(Send, { foreignKey: 'send_id', as: 'send' });

List.belongsToMany(Contact, { through: ListMember, foreignKey: 'list_id', otherKey: 'contact_id', as: 'contacts' });
Contact.belongsToMany(List, { through: ListMember, foreignKey: 'contact_id', otherKey: 'list_id', as: 'lists' });

Contact.hasMany(ActivityLog, { foreignKey: 'contact_id', as: 'activity_logs' });
ActivityLog.belongsTo(Contact, { foreignKey: 'contact_id', as: 'contact' });

export {
  Contact,
  Sequence,
  Send,
  SendingAccount,
  Conversion,
  Company,
  EmailEvent,
  List,
  ListMember,
  EmailTemplate,
  ActivityLog,
};

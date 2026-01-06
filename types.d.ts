declare type EmailProps = {
  to: string;
  type: string;
  subscription: any;
}

declare type generateEmailProps = {
    userName: string;
    subscriptionName: string;
    renewalDate: string;
    planName: string;
    price: string;
    paymentMethod: string;
    accountSettingsLink: string;
    supportLink: string;
    daysLeft: number;
}